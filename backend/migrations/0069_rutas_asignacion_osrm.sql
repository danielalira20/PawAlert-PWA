-- Ruta calculada para la propuesta confirmada. Vive en la propuesta porque
-- una reasignacion puede producir otra ruta para el mismo reporte.

ALTER TABLE public.propuestas_asignacion
  ADD COLUMN IF NOT EXISTS ruta_status text,
  ADD COLUMN IF NOT EXISTS ruta_duracion_segundos numeric,
  ADD COLUMN IF NOT EXISTS ruta_distancia_metros numeric,
  ADD COLUMN IF NOT EXISTS ruta_geometria jsonb,
  ADD COLUMN IF NOT EXISTS ruta_error_codigo text,
  ADD COLUMN IF NOT EXISTS ruta_calculada_at timestamptz,
  ADD COLUMN IF NOT EXISTS ruta_origen_latitud double precision,
  ADD COLUMN IF NOT EXISTS ruta_origen_longitud double precision,
  ADD COLUMN IF NOT EXISTS ruta_destino_latitud double precision,
  ADD COLUMN IF NOT EXISTS ruta_destino_longitud double precision;

ALTER TABLE public.propuestas_asignacion
  DROP CONSTRAINT IF EXISTS propuestas_ruta_status_check,
  ADD CONSTRAINT propuestas_ruta_status_check CHECK (
    ruta_status IS NULL OR ruta_status IN ('complete', 'unavailable')
  ),
  DROP CONSTRAINT IF EXISTS propuestas_ruta_valores_check,
  ADD CONSTRAINT propuestas_ruta_valores_check CHECK (
    (
      ruta_status IS NULL
      AND ruta_duracion_segundos IS NULL
      AND ruta_distancia_metros IS NULL
      AND ruta_geometria IS NULL
      AND ruta_error_codigo IS NULL
      AND ruta_calculada_at IS NULL
    )
    OR (
      ruta_status = 'complete'
      AND ruta_duracion_segundos >= 0
      AND ruta_distancia_metros >= 0
      AND ruta_geometria IS NOT NULL
      AND ruta_error_codigo IS NULL
      AND ruta_calculada_at IS NOT NULL
    )
    OR (
      ruta_status = 'unavailable'
      AND ruta_duracion_segundos IS NULL
      AND ruta_distancia_metros IS NULL
      AND ruta_geometria IS NULL
      AND ruta_error_codigo IS NOT NULL
      AND ruta_calculada_at IS NOT NULL
    )
  ),
  DROP CONSTRAINT IF EXISTS propuestas_ruta_geometria_check,
  ADD CONSTRAINT propuestas_ruta_geometria_check CHECK (
    ruta_geometria IS NULL
    OR (
      jsonb_typeof(ruta_geometria) = 'object'
      AND ruta_geometria->>'type' = 'LineString'
      AND jsonb_typeof(ruta_geometria->'coordinates') = 'array'
    )
  ),
  DROP CONSTRAINT IF EXISTS propuestas_ruta_error_check,
  ADD CONSTRAINT propuestas_ruta_error_check CHECK (
    ruta_error_codigo IS NULL OR ruta_error_codigo IN (
      'not_configured', 'timeout', 'provider_error', 'invalid_response',
      'no_route', 'request_too_large', 'missing_coordinates'
    )
  );

CREATE INDEX IF NOT EXISTS propuestas_ruta_confirmada_idx
  ON public.propuestas_asignacion(reporte_id, ruta_calculada_at DESC)
  WHERE estado = 'confirmada';

COMMENT ON COLUMN public.propuestas_asignacion.ruta_geometria IS
  'GeoJSON LineString privado, visible solo despues de confirmar al voluntario.';

ALTER TABLE public.propuestas_asignacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.propuestas_asignacion
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.propuestas_asignacion TO service_role;
