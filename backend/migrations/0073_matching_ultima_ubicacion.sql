-- Hace que la proximidad operativa use el ultimo avistamiento validado.
-- Las coordenadas originales del reporte se conservan sin cambios como evidencia.

BEGIN;

ALTER TABLE public.reportes
  ADD COLUMN IF NOT EXISTS ultima_latitud_confirmada double precision,
  ADD COLUMN IF NOT EXISTS ultima_longitud_confirmada double precision;

COMMENT ON COLUMN public.reportes.ultima_latitud_confirmada IS
  'Latitud operativa del ultimo avistamiento validado. NULL usa la ubicacion original del reporte.';
COMMENT ON COLUMN public.reportes.ultima_longitud_confirmada IS
  'Longitud operativa del ultimo avistamiento validado. NULL usa la ubicacion original del reporte.';

-- Completa reportes que ya tenian un avistamiento validado antes de esta migracion.
UPDATE public.reportes AS rep
SET
  ultima_latitud_confirmada = av.latitud,
  ultima_longitud_confirmada = av.longitud
FROM public.avistamientos_animal AS av
WHERE rep.ultima_ubicacion_confirmada_id = av.id
  AND av.estado_validacion = 'validado'
  AND (
    rep.ultima_latitud_confirmada IS DISTINCT FROM av.latitud
    OR rep.ultima_longitud_confirmada IS DISTINCT FROM av.longitud
  );

CREATE OR REPLACE FUNCTION public.candidatos_para_reporte(p_reporte_id uuid)
RETURNS TABLE(
  voluntario_id uuid,
  usuario_id uuid,
  nombre text,
  rol text,
  distancia_km numeric,
  radio_max_km smallint,
  disponibilidad jsonb,
  tiempo_reaccion text,
  disponibilidad_urgencias text,
  max_casos_simultaneos smallint,
  carga_actual bigint,
  medios_transporte text[],
  vehiculo_apto_traslado boolean,
  tamanios_traslado text[],
  especies_manejo text[],
  otras_especies_manejo text[],
  tamanios_manejo text[],
  primeros_auxilios_nivel text,
  experiencias_campo text[],
  trayectoria_tipos text[],
  experiencia_anios text,
  equipamiento text[],
  restricciones_fisicas text[]
)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    v.id AS voluntario_id,
    u.id AS usuario_id,
    TRIM(
      CONCAT_WS(
        ' ',
        u.nombre,
        u.apellido_paterno,
        u.apellido_materno
      )
    )::text AS nombre,
    r.nombre::text AS rol,
    ROUND((
      ST_DistanceSphere(
        ST_MakePoint(c.longitud::float8, c.latitud::float8),
        ST_MakePoint(
          COALESCE(rep.ultima_longitud_confirmada, rep.longitud)::float8,
          COALESCE(rep.ultima_latitud_confirmada, rep.latitud)::float8
        )
      ) / 1000.0
    )::numeric, 2) AS distancia_km,
    c.radio_max_km,
    c.disponibilidad,
    c.tiempo_reaccion::text,
    c.disponibilidad_urgencias::text,
    c.max_casos_simultaneos,
    COALESCE((
      SELECT COUNT(*)
      FROM public.reportes activos
      WHERE activos.staff_asignado_id = u.id
        AND activos.estado_reporte::text IN (
          'asignado',
          'en_camino',
          'en_atencion'
        )
    ), 0)::bigint AS carga_actual,
    c.medios_transporte,
    c.vehiculo_apto_traslado,
    c.tamanios_traslado,
    c.especies_manejo,
    c.otras_especies_manejo,
    c.tamanios_manejo,
    c.primeros_auxilios_nivel::text,
    c.experiencias_campo,
    c.trayectoria_tipos,
    c.experiencia_anios::text,
    c.equipamiento,
    c.restricciones_fisicas
  FROM public.voluntarios v
  JOIN public.usuarios u
    ON u.id = v.usuario_id
  JOIN public.roles r
    ON r.id = u.rol_id
  JOIN public.capacidades c
    ON c.voluntario_id = v.id
  JOIN public.reportes rep
    ON rep.id = p_reporte_id
  WHERE v.estado IN ('activo_nivel_1', 'activo_nivel_2')
    AND (
      v.disponible_operativamente = true
      OR (
        v.disponible_operativamente = false
        AND v.pausa_operativa_hasta IS NOT NULL
        AND v.pausa_operativa_hasta <= now()
      )
    )
    AND c.acepto_terminos = true
    AND c.latitud IS NOT NULL
    AND c.longitud IS NOT NULL
    AND c.radio_max_km IS NOT NULL
    AND COALESCE(rep.ultima_latitud_confirmada, rep.latitud) IS NOT NULL
    AND COALESCE(rep.ultima_longitud_confirmada, rep.longitud) IS NOT NULL
    AND (
      (
        r.nombre = 'voluntario_interno'
        AND v.asociacion_id = rep.asociacion_asignada_id
      )
      OR (
        r.nombre = 'voluntario_externo'
        AND v.estado = 'activo_nivel_2'
      )
    )
    AND ST_DistanceSphere(
      ST_MakePoint(c.longitud::float8, c.latitud::float8),
      ST_MakePoint(
        COALESCE(rep.ultima_longitud_confirmada, rep.longitud)::float8,
        COALESCE(rep.ultima_latitud_confirmada, rep.latitud)::float8
      )
    ) <= LEAST(c.radio_max_km, 30) * 1000
    AND (
      SELECT COUNT(*)
      FROM public.reportes activos
      WHERE activos.staff_asignado_id = u.id
        AND activos.estado_reporte::text IN (
          'asignado',
          'en_camino',
          'en_atencion'
        )
    ) < c.max_casos_simultaneos;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
