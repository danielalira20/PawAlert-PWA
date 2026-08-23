-- Corrige el manejo de capacidades.radio_max_km NULL en
-- candidatos_para_reporte y candidatos_verificacion_hogar.
--
-- Hasta ahora, "AND c.radio_max_km IS NOT NULL" (0010_matching_capacidades_v2.sql,
-- lineas 114 y 212) excluia por completo a cualquier voluntario sin radio
-- configurado -- no es un accidente de "NULL <= x", es un filtro explicito,
-- pero contradice la decision de producto: NULL significa "sin limite
-- configurado, usar el maximo de la plataforma", no "excluir". El diagnostico
-- encontro 31 de 49 voluntarios activos con radio_max_km NULL siendo
-- descartados en silencio de todo matching interno.
--
-- No toca 0010: reemplaza ambas funciones con CREATE OR REPLACE, mismo
-- RETURNS TABLE y misma logica en todo lo demas. Unico cambio en cada una:
--   - se quita "AND c.radio_max_km IS NOT NULL"
--   - la comparacion de distancia pasa de LEAST(c.radio_max_km, 30) a
--     LEAST(COALESCE(c.radio_max_km, 30), 30) -- 30 = MAX_RADIO_KM en
--     app/services/matching.py, confirmado antes de escribir esta migracion.

BEGIN;

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
        ST_MakePoint(rep.longitud::float8, rep.latitud::float8)
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
    AND rep.latitud IS NOT NULL
    AND rep.longitud IS NOT NULL
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
      ST_MakePoint(rep.longitud::float8, rep.latitud::float8)
    ) <= LEAST(COALESCE(c.radio_max_km, 30), 30) * 1000
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

CREATE OR REPLACE FUNCTION public.candidatos_verificacion_hogar(
  p_verificacion_hogar_id uuid
)
RETURNS TABLE(
  voluntario_id uuid,
  usuario_id uuid,
  nombre text,
  distancia_km numeric,
  tramo_distancia text,
  radio_max_km smallint,
  disponibilidad jsonb,
  canal_contacto character varying
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
    ROUND((
      ST_DistanceSphere(
        ST_MakePoint(c.longitud::float8, c.latitud::float8),
        ST_MakePoint(pct.longitud::float8, pct.latitud::float8)
      ) / 1000.0
    )::numeric, 2) AS distancia_km,
    CASE
      WHEN ST_DistanceSphere(
        ST_MakePoint(c.longitud::float8, c.latitud::float8),
        ST_MakePoint(pct.longitud::float8, pct.latitud::float8)
      ) <= 15000 THEN 'preferente'::text
      ELSE 'extendido'::text
    END AS tramo_distancia,
    c.radio_max_km,
    c.disponibilidad,
    c.canal_contacto
  FROM public.verificaciones_hogar vh
  JOIN public.perfil_casa_temporal pct
    ON pct.id = vh.perfil_casa_temporal_id
  JOIN public.voluntarios v
    ON v.asociacion_id = vh.asociacion_id
  JOIN public.usuarios u
    ON u.id = v.usuario_id
  JOIN public.roles r
    ON r.id = u.rol_id
  JOIN public.capacidades c
    ON c.voluntario_id = v.id
  WHERE vh.id = p_verificacion_hogar_id
    AND v.id <> vh.voluntario_postulante_id
    AND v.estado IN ('activo_nivel_1', 'activo_nivel_2')
    AND (
      v.disponible_operativamente = true
      OR (
        v.disponible_operativamente = false
        AND v.pausa_operativa_hasta IS NOT NULL
        AND v.pausa_operativa_hasta <= now()
      )
    )
    AND r.nombre = 'voluntario_interno'
    AND c.acepto_terminos = true
    AND c.latitud IS NOT NULL
    AND c.longitud IS NOT NULL
    AND pct.latitud IS NOT NULL
    AND pct.longitud IS NOT NULL
    AND ST_DistanceSphere(
      ST_MakePoint(c.longitud::float8, c.latitud::float8),
      ST_MakePoint(pct.longitud::float8, pct.latitud::float8)
    ) <= LEAST(COALESCE(c.radio_max_km, 30), 30) * 1000
  ORDER BY distancia_km ASC;
$function$;

COMMIT;
