-- Validación EXIF-vs-ubicación-declarada para la foto inicial del
-- reporte. Señal puramente informativa (no dispara requiere_revision ni
-- ningún badge) — separada de la señal de Gemini Vision.

BEGIN;

ALTER TABLE public.animal_fotos
  ADD COLUMN IF NOT EXISTS exif_latitud double precision,
  ADD COLUMN IF NOT EXISTS exif_longitud double precision,
  ADD COLUMN IF NOT EXISTS exif_distancia_declarada_m double precision,
  ADD COLUMN IF NOT EXISTS exif_estado_verificacion character varying;

ALTER TABLE public.animal_fotos
  ADD CONSTRAINT animal_fotos_exif_estado_verificacion_check
    CHECK (exif_estado_verificacion IS NULL OR exif_estado_verificacion IN ('coincidente','discrepancia','sin_gps_exif'));

COMMENT ON COLUMN public.animal_fotos.exif_estado_verificacion IS
  'Comparación informativa EXIF vs. ubicación declarada del reporte. No dispara requiere_revision ni ningún badge — señal separada de Gemini Vision.';

NOTIFY pgrst, 'reload schema';

COMMIT;
