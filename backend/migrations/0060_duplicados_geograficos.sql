-- Deteccion de duplicados por distancia real (PostGIS) en vez de texto.
--
-- Reemplaza el filtro por igualdad de municipio/colonia que usaba
-- verificar_duplicados (report_service.py) por radio (150m) + ventana
-- temporal (+-120min) + especie compartida. Los estados excluidos de
-- estado_reporte son exactamente los 7 confirmados contra la base real
-- documentados en reputacion_service.py tras el bug 22P02 -- 'rechazado'
-- nunca existio en ese enum, vive solo en estado_moderacion (columna
-- aparte), por eso se filtra con una condicion propia.

BEGIN;

CREATE INDEX IF NOT EXISTS reportes_ubicacion_geography_idx
ON public.reportes USING gist (
  (ST_SetSRID(
    ST_MakePoint(longitud::double precision, latitud::double precision),
    4326
  )::geography)
)
WHERE latitud IS NOT NULL AND longitud IS NOT NULL;

CREATE OR REPLACE FUNCTION public.buscar_duplicados_geograficos(
  p_latitud numeric,
  p_longitud numeric,
  p_created_at timestamp with time zone,
  p_tipo_animal_ids uuid[],
  p_reporte_id uuid DEFAULT NULL
)
RETURNS TABLE(
  existing_report_id uuid,
  distance_m numeric,
  time_difference_minutes numeric,
  shared_species text[]
)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    rep.id AS existing_report_id,
    ROUND((
      ST_Distance(
        ST_SetSRID(ST_MakePoint(p_longitud::float8, p_latitud::float8), 4326)::geography,
        ST_SetSRID(ST_MakePoint(rep.longitud::float8, rep.latitud::float8), 4326)::geography
      )
    )::numeric, 2) AS distance_m,
    ROUND(
      ABS(EXTRACT(EPOCH FROM (p_created_at - rep.created_at)) / 60.0)::numeric, 2
    ) AS time_difference_minutes,
    ARRAY(
      SELECT DISTINCT tac.clave
      FROM public.animal a2
      JOIN public.tipo_animal_catalogo tac ON tac.id = a2.tipo_animal_id
      WHERE a2.reporte_id = rep.id
        AND a2.tipo_animal_id = ANY(p_tipo_animal_ids)
    ) AS shared_species
  FROM public.reportes rep
  WHERE rep.id IS DISTINCT FROM p_reporte_id
    AND rep.latitud IS NOT NULL
    AND rep.longitud IS NOT NULL
    AND rep.created_at BETWEEN p_created_at - INTERVAL '120 minutes'
                            AND p_created_at + INTERVAL '120 minutes'
    AND rep.estado_validacion_reporte = 'aprobado'
    AND rep.estado_reporte NOT IN (
      'cerrado', 'cancelado_por_reportante', 'duplicado',
      'duplicado_vinculable', 'duplicado_informativo',
      'rescatado', 'muerto'
    )
    AND rep.estado_moderacion IS DISTINCT FROM 'rechazado'
    AND EXISTS (
      SELECT 1 FROM public.animal a
      WHERE a.reporte_id = rep.id
        AND a.tipo_animal_id = ANY(p_tipo_animal_ids)
    )
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(p_longitud::float8, p_latitud::float8), 4326)::geography,
      ST_SetSRID(ST_MakePoint(rep.longitud::float8, rep.latitud::float8), 4326)::geography,
      150
    )
  ORDER BY distance_m ASC, time_difference_minutes ASC;
$function$;

REVOKE ALL ON FUNCTION public.buscar_duplicados_geograficos(
  numeric, numeric, timestamp with time zone, uuid[], uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.buscar_duplicados_geograficos(
  numeric, numeric, timestamp with time zone, uuid[], uuid
) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
