-- Estado intermedio entre aceptar una propuesta y programar la visita.
--
-- Evita marcar una visita como programada antes de que ambas partes hayan
-- acordado fecha y hora.

BEGIN;

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
      'visita_programada',
      'revision_remota',
      'reagendar',
      'requiere_cambios',
      'aprobada',
      'rechazada'
    )
  );

COMMIT;
