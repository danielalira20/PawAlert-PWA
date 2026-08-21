-- Persistencia privada de embeddings CLIP para similitud visual antifraude.

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.reporte_imagen_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid NOT NULL REFERENCES public.reportes(id) ON DELETE CASCADE,
  animal_foto_id uuid NOT NULL REFERENCES public.animal_fotos(id) ON DELETE CASCADE,
  modelo text NOT NULL,
  dimensiones smallint NOT NULL DEFAULT 512,
  estado text NOT NULL,
  embedding extensions.vector(512),
  error_codigo text,
  calculado_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reporte_imagen_embeddings_foto_modelo_unico
    UNIQUE (animal_foto_id, modelo),
  CONSTRAINT reporte_imagen_embeddings_dimensiones_check
    CHECK (dimensiones = 512),
  CONSTRAINT reporte_imagen_embeddings_estado_check
    CHECK (estado IN ('complete', 'unavailable')),
  CONSTRAINT reporte_imagen_embeddings_error_check
    CHECK (
      error_codigo IS NULL OR error_codigo IN (
        'not_configured', 'timeout', 'unauthorized', 'rate_limited',
        'provider_error', 'invalid_response', 'no_data'
      )
    ),
  CONSTRAINT reporte_imagen_embeddings_resultado_check
    CHECK (
      (estado = 'complete' AND embedding IS NOT NULL AND error_codigo IS NULL)
      OR
      (estado = 'unavailable' AND embedding IS NULL AND error_codigo IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS reporte_imagen_embeddings_reporte_idx
  ON public.reporte_imagen_embeddings(reporte_id, calculado_at DESC);

CREATE INDEX IF NOT EXISTS reporte_imagen_embeddings_hnsw_idx
  ON public.reporte_imagen_embeddings
  USING hnsw (embedding extensions.vector_cosine_ops)
  WHERE estado = 'complete';

CREATE OR REPLACE FUNCTION public.buscar_similitud_visual(
  p_embedding extensions.vector(512),
  p_reporte_id uuid,
  p_modelo text,
  p_umbral real DEFAULT 0,
  p_limite integer DEFAULT 5
)
RETURNS TABLE(
  embedding_id uuid,
  reporte_id uuid,
  animal_foto_id uuid,
  similitud real,
  modelo text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, extensions
AS $function$
BEGIN
  IF p_embedding IS NULL THEN
    RAISE EXCEPTION 'embedding_requerido' USING ERRCODE = '22004';
  END IF;
  IF NULLIF(btrim(p_modelo), '') IS NULL THEN
    RAISE EXCEPTION 'modelo_requerido' USING ERRCODE = '22023';
  END IF;
  IF p_umbral < 0 OR p_umbral > 1 THEN
    RAISE EXCEPTION 'umbral_fuera_de_rango' USING ERRCODE = '22023';
  END IF;
  IF p_limite < 1 OR p_limite > 20 THEN
    RAISE EXCEPTION 'limite_fuera_de_rango' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    rie.id,
    rie.reporte_id,
    rie.animal_foto_id,
    (1 - (rie.embedding <=> p_embedding))::real AS similitud,
    rie.modelo
  FROM public.reporte_imagen_embeddings rie
  WHERE rie.estado = 'complete'
    AND rie.embedding IS NOT NULL
    AND rie.modelo = p_modelo
    AND rie.reporte_id IS DISTINCT FROM p_reporte_id
    AND (1 - (rie.embedding <=> p_embedding)) >= p_umbral
  ORDER BY rie.embedding <=> p_embedding ASC, rie.calculado_at DESC
  LIMIT p_limite;
END;
$function$;

ALTER TABLE public.reporte_imagen_embeddings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.reporte_imagen_embeddings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.reporte_imagen_embeddings TO service_role;

REVOKE ALL ON FUNCTION public.buscar_similitud_visual(
  extensions.vector, uuid, text, real, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_similitud_visual(
  extensions.vector, uuid, text, real, integer
) TO service_role;

COMMENT ON TABLE public.reporte_imagen_embeddings IS
  'Embeddings privados de fotografías de reportes y fallos controlados del proveedor CLIP.';
COMMENT ON FUNCTION public.buscar_similitud_visual(
  extensions.vector, uuid, text, real, integer
) IS
  'Busca fotografías similares del mismo modelo mediante distancia coseno; uso exclusivo del backend.';

NOTIFY pgrst, 'reload schema';

COMMIT;
