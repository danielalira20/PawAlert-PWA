-- Ejecución segura de una visita presencial de verificación.
--
-- El check-in y check-out registran la visita de la persona verificadora.
-- El checklist conserva la evidencia humana y el resultado cierra o devuelve
-- a corrección la postulación.

BEGIN;

ALTER TABLE public.asignaciones_verificacion_hogar
  ADD COLUMN IF NOT EXISTS check_in_latitud numeric,
  ADD COLUMN IF NOT EXISTS check_in_longitud numeric,
  ADD COLUMN IF NOT EXISTS check_in_distancia_m numeric,
  ADD COLUMN IF NOT EXISTS resultado_visita character varying,
  ADD COLUMN IF NOT EXISTS motivo_resultado_visita text,
  ADD COLUMN IF NOT EXISTS resultado_at timestamp with time zone;

ALTER TABLE public.asignaciones_verificacion_hogar
  DROP CONSTRAINT IF EXISTS asignaciones_verificacion_resultado_visita_check;

ALTER TABLE public.asignaciones_verificacion_hogar
  ADD CONSTRAINT asignaciones_verificacion_resultado_visita_check
  CHECK (
    resultado_visita IS NULL
    OR resultado_visita IN ('aprobar', 'solicitar_ajustes', 'rechazar')
  );

ALTER TABLE public.asignaciones_verificacion_hogar
  DROP CONSTRAINT IF EXISTS asignaciones_verificacion_checkin_coordenadas_check;

ALTER TABLE public.asignaciones_verificacion_hogar
  ADD CONSTRAINT asignaciones_verificacion_checkin_coordenadas_check
  CHECK (
    (check_in_latitud IS NULL AND check_in_longitud IS NULL)
    OR (
      check_in_latitud BETWEEN -90 AND 90
      AND check_in_longitud BETWEEN -180 AND 180
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
      'visita_en_curso',
      'visita_realizada',
      'revision_remota',
      'reagendar',
      'requiere_cambios',
      'aprobada',
      'rechazada'
    )
  );

COMMIT;
