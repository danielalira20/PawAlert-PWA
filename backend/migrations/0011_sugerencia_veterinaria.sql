-- Motor de sugerencias, Ruta 1 (BACK01) — recurso ligado a un caso.
--
-- Cuando se registra el hito "encontre_animal" con una condición médica que
-- lo amerita, se busca la oferta proactiva de servicios veterinarios más
-- cercana compatible por categoría + zona + nivel de urgencia. Solo lectura:
-- no reserva capacidad (eso es BACK02, tarea aparte) ni crea nada — la
-- llamada la hace app/services/red_aliados_service.py vía supabase.rpc(),
-- mismo patrón que assignment_service.py con encontrar_asociacion_cercana.
--
-- perfil_apoyo.zona_cobertura es geography(Point) (a diferencia de
-- asociaciones.latitud/longitud, columnas numéricas sueltas) — por eso se
-- usa ST_DWithin/ST_Distance nativos de geography en vez del Haversine
-- manual de encontrar_asociacion_cercana.
--
-- Sin tope de radio: pa.radio_km es la cobertura que el propio aliado
-- declaró, no una distancia de traslado externa que deba limitarse (a
-- diferencia del LEAST(..., 30) que sí aplica candidatos_para_reporte para
-- traslado de voluntarios).

CREATE OR REPLACE FUNCTION public.sugerencia_veterinaria_cercana(
  p_reporte_id uuid,
  p_nivel_urgencia text
)
RETURNS TABLE(
  oferta_id uuid,
  perfil_apoyo_id uuid,
  usuario_id uuid,
  nombre text,
  distancia_km numeric,
  unidad character varying,
  capacidad_disponible numeric
)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    o.id AS oferta_id,
    pa.id AS perfil_apoyo_id,
    u.id AS usuario_id,
    TRIM(CONCAT_WS(' ', u.nombre, u.apellido_paterno))::text AS nombre,
    ROUND((
      ST_Distance(
        pa.zona_cobertura,
        ST_MakePoint(rep.longitud::float8, rep.latitud::float8)::geography
      ) / 1000.0
    )::numeric, 2) AS distancia_km,
    o.unidad,
    o.capacidad_disponible
  FROM public.ofertas_proactivas o
  JOIN public.perfil_apoyo pa ON pa.id = o.perfil_apoyo_id
  JOIN public.usuarios u ON u.id = pa.usuario_id
  JOIN public.reportes rep ON rep.id = p_reporte_id
  WHERE o.categoria = 'servicios_veterinarios'
    AND o.activa = true
    AND o.capacidad_disponible > 0
    AND pa.verificado_admin = true
    AND pa.tipo IN ('aliado_local', 'patrocinador_institucional')
    AND p_nivel_urgencia = ANY(pa.niveles_urgencia_atendida)
    AND pa.zona_cobertura IS NOT NULL
    AND pa.radio_km IS NOT NULL
    AND rep.latitud IS NOT NULL
    AND rep.longitud IS NOT NULL
    AND ST_DWithin(
      pa.zona_cobertura,
      ST_MakePoint(rep.longitud::float8, rep.latitud::float8)::geography,
      pa.radio_km * 1000
    )
  ORDER BY distancia_km ASC
  LIMIT 1;
$function$;
