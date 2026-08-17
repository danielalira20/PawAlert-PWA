-- Selector operativo de asociacion coordinadora.
--
-- Se crea una RPC nueva para conservar encontrar_asociacion_cercana durante
-- la transicion. El resultado mantiene el contrato minimo id/nombre/distancia.

BEGIN;

CREATE INDEX IF NOT EXISTS reportes_carga_asociacion_activa_idx
  ON public.reportes(asociacion_asignada_id, estado_reporte)
  WHERE asociacion_asignada_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.encontrar_asociacion_operativa(
  reporte_lat numeric,
  reporte_lng numeric,
  excluir_ids uuid[] DEFAULT '{}'::uuid[],
  p_tipos_animales text[] DEFAULT NULL::text[],
  p_es_critico boolean DEFAULT false
)
RETURNS TABLE(
  id uuid,
  nombre character varying,
  distancia_km numeric
)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $function$
  WITH carga AS (
    SELECT
      r.asociacion_asignada_id AS asociacion_id,
      COUNT(*)::integer AS casos_activos,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM public.animal an
          JOIN public.condicion_catalogo cc ON cc.id = an.condicion_id
          WHERE an.reporte_id = r.id
            AND cc.clave = 'grave'
        )
      )::integer AS casos_criticos_activos
    FROM public.reportes r
    WHERE r.asociacion_asignada_id IS NOT NULL
      AND r.estado_reporte::text IN ('asignado', 'en_camino', 'en_atencion')
      AND r.estado_validacion_reporte = 'aprobado'
      AND COALESCE(r.estado_moderacion, 'visible') <> 'rechazado'
    GROUP BY r.asociacion_asignada_id
  ),
  candidatas AS (
    SELECT
      a.id,
      a.nombre,
      a.created_at,
      a.radio_km,
      a.capacidad_reportes_simultaneos,
      a.capacidad_reportes_criticos,
      COALESCE(c.casos_activos, 0) AS casos_activos,
      COALESCE(c.casos_criticos_activos, 0) AS casos_criticos_activos,
      (
        ST_DistanceSphere(
          ST_MakePoint(a.longitud::double precision, a.latitud::double precision),
          ST_MakePoint(reporte_lng::double precision, reporte_lat::double precision)
        ) / 1000.0
      )::numeric AS distancia_km
    FROM public.asociaciones a
    LEFT JOIN carga c ON c.asociacion_id = a.id
    WHERE a.activo = true
      AND a.verificado = true
      AND a.recepcion_reportes_activa = true
      AND NOT (a.id = ANY(COALESCE(excluir_ids, '{}'::uuid[])))
      AND (
        p_tipos_animales IS NULL
        OR p_tipos_animales <@ a.tipos_animales::text[]
      )
      AND COALESCE(c.casos_activos, 0) < a.capacidad_reportes_simultaneos
      AND (
        NOT p_es_critico
        OR COALESCE(c.casos_criticos_activos, 0) < a.capacidad_reportes_criticos
      )
      AND (
        a.recepcion_reportes_24h
        OR (
          EXTRACT(ISODOW FROM timezone('America/Mexico_City', now()))::smallint
            = ANY(a.dias_recepcion)
          AND (
            (
              a.hora_inicio_recepcion <= a.hora_fin_recepcion
              AND timezone('America/Mexico_City', now())::time
                BETWEEN a.hora_inicio_recepcion AND a.hora_fin_recepcion
            )
            OR (
              a.hora_inicio_recepcion > a.hora_fin_recepcion
              AND (
                timezone('America/Mexico_City', now())::time >= a.hora_inicio_recepcion
                OR timezone('America/Mexico_City', now())::time <= a.hora_fin_recepcion
              )
            )
          )
        )
      )
  ),
  dentro_de_radio AS (
    SELECT *,
      CASE
        WHEN p_es_critico THEN
          (distancia_km / NULLIF(radio_km, 0)) * 0.45
          + (casos_activos::numeric / capacidad_reportes_simultaneos) * 0.35
          + (
              casos_criticos_activos::numeric
              / NULLIF(capacidad_reportes_criticos, 0)
            ) * 0.20
        ELSE
          (distancia_km / NULLIF(radio_km, 0)) * 0.60
          + (casos_activos::numeric / capacidad_reportes_simultaneos) * 0.40
      END AS puntaje_operativo
    FROM candidatas
    WHERE distancia_km <= radio_km
  )
  SELECT
    d.id,
    d.nombre,
    ROUND(d.distancia_km, 2) AS distancia_km
  FROM dentro_de_radio d
  ORDER BY
    d.puntaje_operativo ASC,
    d.distancia_km ASC,
    d.created_at ASC,
    d.id ASC
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.encontrar_asociacion_operativa(
  numeric, numeric, uuid[], text[], boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encontrar_asociacion_operativa(
  numeric, numeric, uuid[], text[], boolean
) TO service_role;

COMMENT ON FUNCTION public.encontrar_asociacion_operativa(
  numeric, numeric, uuid[], text[], boolean
) IS 'Selecciona coordinadora por cobertura, horario, capacidad, carga y distancia.';

NOTIFY pgrst, 'reload schema';

COMMIT;
