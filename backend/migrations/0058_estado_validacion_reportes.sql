-- Estado previo a la activacion operativa de un reporte.
--
-- Esta capa no sustituye estado_moderacion: validacion_reporte decide si un
-- caso puede entrar por primera vez al flujo de cobertura, mientras que la
-- moderacion controla su visibilidad ante revisiones posteriores.

BEGIN;

ALTER TABLE public.reportes
  ADD COLUMN IF NOT EXISTS estado_validacion_reporte text,
  ADD COLUMN IF NOT EXISTS validacion_completada_at timestamptz,
  ADD COLUMN IF NOT EXISTS activado_at timestamptz,
  ADD COLUMN IF NOT EXISTS razones_validacion jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Los reportes historicos ya atravesaron el flujo anterior. Se conserva su
-- situacion actual para que desplegar esta migracion no retire casos activos.
-- Los nuevos reportes empezaran en "procesando" cuando el siguiente cambio
-- conecte explicitamente la creacion con la compuerta de activacion.
UPDATE public.reportes
SET
  estado_validacion_reporte = CASE
    WHEN estado_moderacion = 'rechazado' THEN 'rechazado'
    WHEN estado_moderacion = 'en_revision' THEN 'revision_manual'
    ELSE 'aprobado'
  END,
  validacion_completada_at = CASE
    WHEN estado_moderacion = 'en_revision' THEN NULL
    ELSE COALESCE(validacion_completada_at, created_at, now())
  END,
  activado_at = CASE
    WHEN estado_moderacion IN ('en_revision', 'rechazado') THEN activado_at
    ELSE COALESCE(activado_at, created_at, now())
  END
WHERE estado_validacion_reporte IS NULL;

ALTER TABLE public.reportes
  ALTER COLUMN estado_validacion_reporte SET DEFAULT 'aprobado',
  ALTER COLUMN estado_validacion_reporte SET NOT NULL;

ALTER TABLE public.reportes
  DROP CONSTRAINT IF EXISTS reportes_estado_validacion_reporte_check,
  ADD CONSTRAINT reportes_estado_validacion_reporte_check CHECK (
    estado_validacion_reporte IN (
      'procesando', 'aprobado', 'revision_manual', 'rechazado'
    )
  ),
  DROP CONSTRAINT IF EXISTS reportes_razones_validacion_array_check,
  ADD CONSTRAINT reportes_razones_validacion_array_check CHECK (
    jsonb_typeof(razones_validacion) = 'array'
  );

CREATE INDEX IF NOT EXISTS reportes_estado_validacion_created_idx
  ON public.reportes(estado_validacion_reporte, created_at DESC);

CREATE INDEX IF NOT EXISTS reportes_revision_validacion_pendiente_idx
  ON public.reportes(created_at DESC)
  WHERE estado_validacion_reporte = 'revision_manual';

COMMENT ON COLUMN public.reportes.estado_validacion_reporte IS
  'Compuerta previa a cobertura: procesando, aprobado, revision_manual o rechazado.';
COMMENT ON COLUMN public.reportes.validacion_completada_at IS
  'Fecha en que concluyo la validacion previa a la activacion.';
COMMENT ON COLUMN public.reportes.activado_at IS
  'Primera fecha en que el reporte entro al flujo operativo.';
COMMENT ON COLUMN public.reportes.razones_validacion IS
  'Lista estructurada de senales que determinaron la validacion del reporte.';

NOTIFY pgrst, 'reload schema';

COMMIT;
