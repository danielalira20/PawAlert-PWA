-- Validación de contenido con Gemini Vision para fotos de animal en la
-- creación de reportes. Rechazo duro si la foto no muestra un animal real;
-- estimación de condición visual como dato informativo para un futuro
-- urgency score. Sin EXIF en este esfuerzo.

BEGIN;

ALTER TABLE public.animal_fotos
  ADD COLUMN IF NOT EXISTS analisis_ia_modelo character varying,
  ADD COLUMN IF NOT EXISTS analisis_ia_confianza numeric,
  ADD COLUMN IF NOT EXISTS analisis_ia_condicion character varying,
  ADD COLUMN IF NOT EXISTS analisis_ia_procesado_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS analisis_ia_estado character varying,
  ADD COLUMN IF NOT EXISTS analisis_ia_error text,
  ADD COLUMN IF NOT EXISTS analisis_ia_raw jsonb,
  ADD COLUMN IF NOT EXISTS requiere_revision boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revision_resuelta_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS revisado_por uuid REFERENCES public.usuarios(id);

ALTER TABLE public.animal_fotos
  ADD CONSTRAINT animal_fotos_analisis_ia_condicion_check
    CHECK (analisis_ia_condicion IS NULL OR analisis_ia_condicion IN ('estable','herido','grave')),
  ADD CONSTRAINT animal_fotos_analisis_ia_estado_check
    CHECK (analisis_ia_estado IS NULL OR analisis_ia_estado IN ('completado','error_tecnico'));

ALTER TABLE public.animal
  ADD COLUMN IF NOT EXISTS condicion_estimada_ia character varying;

ALTER TABLE public.animal
  ADD CONSTRAINT animal_condicion_estimada_ia_check
    CHECK (condicion_estimada_ia IS NULL OR condicion_estimada_ia IN ('estable','herido','grave'));

COMMENT ON COLUMN public.animal_fotos.requiere_revision IS
  'Verdadero cuando el análisis de Gemini Vision falló técnicamente y la foto necesita revisión manual.';
COMMENT ON COLUMN public.animal.condicion_estimada_ia IS
  'Condición más grave estimada por Gemini Vision entre las fotos del animal; informativa, no reemplaza condicion_id declarado.';

NOTIFY pgrst, 'reload schema';

COMMIT;
