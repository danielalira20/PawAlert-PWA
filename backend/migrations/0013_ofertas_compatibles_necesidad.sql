-- BACK03 — motor de sugerencias, Ruta 2 (recurso general, sin caso puntual).
--
-- A diferencia de Ruta 1 (sugerencia_veterinaria_cercana, ligada a un
-- reporte con urgencia médica), aquí no hay ningún hito de por medio: la
-- asociación consulta bajo demanda contra sus necesidades generales
-- (reporte_id IS NULL). Se ancla en asociaciones.latitud/longitud (vía
-- necesidades.asociacion_id) en vez de reportes — una necesidad general no
-- tiene coordenadas propias. Categoría dinámica (n.categoria, no
-- hardcodeada como 'servicios_veterinarios' en Ruta 1), sin filtro de
-- urgencia, y sin LIMIT — regresa la lista completa ordenada por
-- distancia para que la asociación compare/elija, no un match único
-- automático como Ruta 1.

CREATE OR REPLACE FUNCTION public.ofertas_compatibles_necesidad(p_necesidad_id uuid)
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
        ST_MakePoint(a.longitud::float8, a.latitud::float8)::geography
      ) / 1000.0
    )::numeric, 2) AS distancia_km,
    o.unidad,
    o.capacidad_disponible
  FROM public.ofertas_proactivas o
  JOIN public.perfil_apoyo pa ON pa.id = o.perfil_apoyo_id
  JOIN public.usuarios u ON u.id = pa.usuario_id
  JOIN public.necesidades n ON n.id = p_necesidad_id
  JOIN public.asociaciones a ON a.id = n.asociacion_id
  WHERE o.categoria = n.categoria
    -- Si la necesidad no especifica subcategoria_id, no se filtra por eso
    -- — solo por categoría.
    AND (n.subcategoria_id IS NULL OR o.subcategoria_id = n.subcategoria_id)
    AND o.activa = true
    AND o.capacidad_disponible > 0
    AND pa.verificado_admin = true
    AND pa.tipo IN ('aliado_local', 'patrocinador_institucional')
    AND pa.zona_cobertura IS NOT NULL
    AND pa.radio_km IS NOT NULL
    AND a.latitud IS NOT NULL
    AND a.longitud IS NOT NULL
    AND ST_DWithin(
      pa.zona_cobertura,
      ST_MakePoint(a.longitud::float8, a.latitud::float8)::geography,
      pa.radio_km * 1000
    )
  ORDER BY distancia_km ASC;
$function$;

-- Registro agregado y flexible del uso de una contribución con el tiempo
-- ("15kg de esta donación se usaron en 3 casos esta semana") — solo la
-- estructura por ahora, ningún endpoint de este alcance escribe aquí
-- todavía (es la pieza de "confirmar uso", trabajo futuro).
CREATE TABLE public.aplicaciones_contribucion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contribucion_id uuid NOT NULL REFERENCES public.contribuciones(id),
  reporte_id uuid REFERENCES public.reportes(id),
  cantidad numeric NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  nota text,
  created_at timestamptz NOT NULL DEFAULT now()
);
