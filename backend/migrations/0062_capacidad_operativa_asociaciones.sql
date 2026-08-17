-- Configuracion operativa para seleccionar una asociacion coordinadora.
--
-- Los defaults conservan el comportamiento actual: asociaciones verificadas
-- y activas reciben reportes todos los dias, las 24 horas. La capacidad
-- explicita permite dejar de enviar casos a una asociacion saturada.

BEGIN;

ALTER TABLE public.asociaciones
  ADD COLUMN IF NOT EXISTS capacidad_reportes_simultaneos smallint NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS capacidad_reportes_criticos smallint NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS recepcion_reportes_activa boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS recepcion_reportes_24h boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dias_recepcion smallint[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[],
  ADD COLUMN IF NOT EXISTS hora_inicio_recepcion time NOT NULL DEFAULT '00:00:00',
  ADD COLUMN IF NOT EXISTS hora_fin_recepcion time NOT NULL DEFAULT '23:59:59';

ALTER TABLE public.asociaciones
  DROP CONSTRAINT IF EXISTS asociaciones_capacidad_reportes_check,
  ADD CONSTRAINT asociaciones_capacidad_reportes_check CHECK (
    capacidad_reportes_simultaneos BETWEEN 1 AND 100
  ),
  DROP CONSTRAINT IF EXISTS asociaciones_capacidad_criticos_check,
  ADD CONSTRAINT asociaciones_capacidad_criticos_check CHECK (
    capacidad_reportes_criticos BETWEEN 0 AND capacidad_reportes_simultaneos
  ),
  DROP CONSTRAINT IF EXISTS asociaciones_dias_recepcion_check,
  ADD CONSTRAINT asociaciones_dias_recepcion_check CHECK (
    cardinality(dias_recepcion) BETWEEN 1 AND 7
    AND dias_recepcion <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]
  );

COMMENT ON COLUMN public.asociaciones.capacidad_reportes_simultaneos IS
  'Maximo de reportes operativos que la asociacion puede coordinar al mismo tiempo.';
COMMENT ON COLUMN public.asociaciones.capacidad_reportes_criticos IS
  'Maximo de reportes con al menos un animal grave que puede coordinar simultaneamente.';
COMMENT ON COLUMN public.asociaciones.recepcion_reportes_activa IS
  'Pausa operativa independiente del estado administrativo de la asociacion.';
COMMENT ON COLUMN public.asociaciones.recepcion_reportes_24h IS
  'Si es true, dias y horas de recepcion no limitan la asignacion inicial.';
COMMENT ON COLUMN public.asociaciones.dias_recepcion IS
  'Dias ISO de recepcion: lunes=1 y domingo=7.';

NOTIFY pgrst, 'reload schema';

COMMIT;
