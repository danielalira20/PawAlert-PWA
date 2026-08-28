-- Restaura el uso de la ultima ubicacion confirmada en candidatos_para_reporte.
--
-- 0073_matching_ultima_ubicacion.sql introdujo COALESCE(rep.ultima_latitud_confirmada,
-- rep.latitud) / COALESCE(rep.ultima_longitud_confirmada, rep.longitud) en el
-- calculo de distancia_km y en el filtro de radio de esta funcion, para que la
-- proximidad operativa use el ultimo avistamiento validado en vez del pin
-- original del reporte. 0074_radio_max_km_null_sin_limite.sql reemplazo la
-- funcion completa con CREATE OR REPLACE y, sin mencionarlo en su comentario
-- (que solo describia el cambio de radio_max_km NULL), volvio a dejar
-- rep.latitud/rep.longitud directos -- perdiendo silenciosamente el fix de
-- 0073. 0075_candidatos_para_reporte_especies_tamanios_base.sql heredo esa
-- regresion sin saberlo (su comentario decia "FROM/JOIN/WHERE identicos a
-- 0074", lo cual era cierto respecto a 0074, pero 0074 ya venia regresionado).
--
-- Efecto de la regresion: dispatch_preparation_service._report_location ya
-- prioriza ultima_latitud_confirmada/ultima_longitud_confirmada cuando
-- existen (ver app/services/dispatch_preparation_service.py), pero el pool de
-- candidatos que arma esta funcion seguia filtrando por radio contra el pin
-- original. Un voluntario dentro del radio de la ubicacion confirmada podia
-- quedar excluido del pool si esa ubicacion se alejo del pin original.
--
-- No toca 0075: mismo RETURNS TABLE (no se agrega ni quita ninguna columna,
-- el tipo de distancia_km no cambia), asi que CREATE OR REPLACE FUNCTION basta
-- sin DROP previo -- mismo patron que uso 0074 cuando tampoco cambiaba la
-- firma de retorno. Unico cambio: el calculo de distancia_km en el SELECT y
-- la condicion de radio en el WHERE vuelven a usar
-- COALESCE(rep.ultima_latitud_confirmada, rep.latitud) /
-- COALESCE(rep.ultima_longitud_confirmada, rep.longitud), exactamente la
-- sintaxis que ya uso 0073. FROM/JOIN/resto del WHERE identicos a 0075.

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
      ST_MakePoint(
        COALESCE(rep.ultima_longitud_confirmada, rep.longitud)::float8,
        COALESCE(rep.ultima_latitud_confirmada, rep.latitud)::float8
      )
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
