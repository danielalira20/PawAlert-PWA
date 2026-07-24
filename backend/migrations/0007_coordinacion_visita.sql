-- Coordinación de fecha y hora para una verificación presencial.
--
-- Mantiene separadas:
--   1. la fecha propuesta por una de las partes;
--   2. la persona que debe responder;
--   3. la visita confirmada por ambas partes.

BEGIN;

ALTER TABLE public.asignaciones_verificacion_hogar
  ADD COLUMN IF NOT EXISTS horario_propuesto_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS horario_propuesto_por character varying,
  ADD COLUMN IF NOT EXISTS horario_estado character varying
    NOT NULL DEFAULT 'sin_propuesta',
  ADD COLUMN IF NOT EXISTS horario_respondido_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS motivo_reagenda text;

ALTER TABLE public.asignaciones_verificacion_hogar
  DROP CONSTRAINT IF EXISTS asignaciones_verificacion_horario_propuesto_por_check;

ALTER TABLE public.asignaciones_verificacion_hogar
  ADD CONSTRAINT asignaciones_verificacion_horario_propuesto_por_check
  CHECK (
    horario_propuesto_por IS NULL
    OR horario_propuesto_por IN ('verificador', 'postulante')
  );

ALTER TABLE public.asignaciones_verificacion_hogar
  DROP CONSTRAINT IF EXISTS asignaciones_verificacion_horario_estado_check;

ALTER TABLE public.asignaciones_verificacion_hogar
  ADD CONSTRAINT asignaciones_verificacion_horario_estado_check
  CHECK (
    horario_estado IN (
      'sin_propuesta',
      'pendiente_postulante',
      'pendiente_verificador',
      'confirmado'
    )
  );

ALTER TABLE public.verificaciones_hogar
  DROP CONSTRAINT IF EXISTS verificaciones_hogar_estado_check;

ALTER TABLE public.verificaciones_hogar
  ADD CONSTRAINT verificaciones_hogar_estado_check
  CHECK (
    estado IN (
      'pendiente_revision',
      'pendiente_asignacion',
      'visita_propuesta',
      'visita_aceptada',
      'coordinando_visita',
      'visita_programada',
      'revision_remota',
      'reagendar',
      'requiere_cambios',
      'aprobada',
      'rechazada'
    )
  );

COMMIT;
