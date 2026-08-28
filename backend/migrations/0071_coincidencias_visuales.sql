-- Auditoría privada de las coincidencias obtenidas para cada embedding CLIP.

BEGIN;

CREATE TABLE IF NOT EXISTS public.reporte_imagen_coincidencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  embedding_consulta_id uuid NOT NULL
    REFERENCES public.reporte_imagen_embeddings(id) ON DELETE CASCADE,
  reporte_id uuid NOT NULL REFERENCES public.reportes(id) ON DELETE CASCADE,
  animal_foto_id uuid NOT NULL REFERENCES public.animal_fotos(id) ON DELETE CASCADE,
  embedding_coincidente_id uuid NOT NULL
    REFERENCES public.reporte_imagen_embeddings(id) ON DELETE CASCADE,
  reporte_coincidente_id uuid NOT NULL
    REFERENCES public.reportes(id) ON DELETE CASCADE,
  animal_foto_coincidente_id uuid NOT NULL
    REFERENCES public.animal_fotos(id) ON DELETE CASCADE,
  similitud real NOT NULL,
  nivel text NOT NULL,
  modelo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reporte_imagen_coincidencias_par_unico
    UNIQUE (embedding_consulta_id, embedding_coincidente_id),
  CONSTRAINT reporte_imagen_coincidencias_reportes_distintos
    CHECK (reporte_id <> reporte_coincidente_id),
  CONSTRAINT reporte_imagen_coincidencias_similitud_check
    CHECK (similitud BETWEEN 0 AND 1),
  CONSTRAINT reporte_imagen_coincidencias_nivel_check
    CHECK (nivel IN ('low', 'gray', 'high'))
);

CREATE INDEX IF NOT EXISTS reporte_imagen_coincidencias_reporte_idx
  ON public.reporte_imagen_coincidencias(reporte_id, similitud DESC);
CREATE INDEX IF NOT EXISTS reporte_imagen_coincidencias_relacionado_idx
  ON public.reporte_imagen_coincidencias(reporte_coincidente_id, similitud DESC);

ALTER TABLE public.reporte_imagen_coincidencias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reporte_imagen_coincidencias FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.reporte_imagen_coincidencias TO service_role;

COMMENT ON TABLE public.reporte_imagen_coincidencias IS
  'Hasta cinco similitudes CLIP por fotografía para calibración y moderación humana.';

NOTIFY pgrst, 'reload schema';

COMMIT;
