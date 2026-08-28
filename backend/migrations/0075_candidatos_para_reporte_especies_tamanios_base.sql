-- Agrega c.especies y c.tamanios a candidatos_para_reporte.
--
-- capacidades.especies/tamanios (campo base, "especies que atiende en
-- general") y capacidades.especies_manejo/tamanios_manejo (experiencia de
-- manejo especifica, agregada por 0003_capacidades_v2.sql) son columnas
-- distintas que coexisten hoy. matching.py:81-89 ya sabe leer ambas -- trae
-- especies_manejo y, si viene vacio, cae a especies como fallback -- pero
-- ese fallback nunca se ejercitaba para voluntarios internos porque esta
-- RPC nunca seleccionaba c.especies/c.tamanios en absoluto: la clave ni
-- existia en la fila que le llegaba a Python. Un interno con
-- especies_manejo=[] pero especies con datos reales quedaba descartado del
-- ranking por especie sin que el fallback tuviera oportunidad de correr.
--
-- No toca 0074: agrega dos columnas a RETURNS TABLE, lo que cambia la firma
-- de retorno, asi que hace falta DROP FUNCTION IF EXISTS antes de recrearla
-- (un CREATE OR REPLACE liso falla con "cannot change return type of
-- existing function"). FROM/JOIN/WHERE identicos a 0074, sin ningun otro
-- cambio de logica.

BEGIN;

DROP FUNCTION IF EXISTS public.candidatos_para_reporte(uuid);

CREATE FUNCTION public.candidatos_para_reporte(p_reporte_id uuid)
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
  especies text[],
  tamanios text[],
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
    c.especies,
    c.tamanios,
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

COMMIT;
