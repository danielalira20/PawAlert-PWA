-- Evidencia automática del video de casa temporal.
--
-- Gemini y los metadatos de ubicación son señales de apoyo:
-- nunca aprueban ni rechazan una postulación automáticamente.

BEGIN;

ALTER TABLE public.verificaciones_hogar
  ADD COLUMN IF NOT EXISTS analisis_video_estado character varying
    NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS analisis_video_modelo character varying,
  ADD COLUMN IF NOT EXISTS analisis_video_error text,
  ADD COLUMN IF NOT EXISTS analisis_video_iniciado_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS analisis_video_procesado_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS coordenadas_video_lat numeric,
  ADD COLUMN IF NOT EXISTS coordenadas_video_lng numeric,
  ADD COLUMN IF NOT EXISTS distancia_coordenadas_m numeric,
  ADD COLUMN IF NOT EXISTS coordenadas_fuente character varying,
  ADD COLUMN IF NOT EXISTS coordenadas_detalle jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.verificaciones_hogar
  DROP CONSTRAINT IF EXISTS verificaciones_hogar_analisis_video_estado_check;

ALTER TABLE public.verificaciones_hogar
  ADD CONSTRAINT verificaciones_hogar_analisis_video_estado_check
  CHECK (
    analisis_video_estado IN (
      'pendiente',
      'procesando',
      'completado',
      'fallido',
      'sin_video',
      'no_configurado'
    )
  );

ALTER TABLE public.verificaciones_hogar
  DROP CONSTRAINT IF EXISTS verificaciones_hogar_estado_coordenadas_check;

ALTER TABLE public.verificaciones_hogar
  ADD CONSTRAINT verificaciones_hogar_estado_coordenadas_check
  CHECK (
    estado_coordenadas IN (
      'pendiente',
      'procesando',
      'coincide',
      'imprecisa',
      'discrepancia',
      'sin_metadatos',
      'sin_video',
      'fallida'
    )
  );

ALTER TABLE public.verificaciones_hogar
  DROP CONSTRAINT IF EXISTS verificaciones_hogar_distancia_coordenadas_check;

ALTER TABLE public.verificaciones_hogar
  ADD CONSTRAINT verificaciones_hogar_distancia_coordenadas_check
  CHECK (
    distancia_coordenadas_m IS NULL
    OR distancia_coordenadas_m >= 0
  );

COMMIT;
