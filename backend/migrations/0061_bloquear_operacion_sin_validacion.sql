-- Defensa estructural: un reporte no puede entrar a cobertura mientras la
-- validacion inicial siga procesando, en revision o haya sido rechazada.

BEGIN;

ALTER TABLE public.reportes
  DROP CONSTRAINT IF EXISTS reportes_operacion_requiere_validacion_check,
  ADD CONSTRAINT reportes_operacion_requiere_validacion_check CHECK (
    estado_validacion_reporte = 'aprobado'
    OR (
      estado_reporte::text = 'pendiente'
      AND estado_cobertura IS NULL
      AND asociacion_asignada_id IS NULL
      AND staff_asignado_id IS NULL
    )
  );

COMMENT ON CONSTRAINT reportes_operacion_requiere_validacion_check
ON public.reportes IS
  'Impide asociacion, cobertura y voluntario antes de aprobar la validacion inicial.';

NOTIFY pgrst, 'reload schema';

COMMIT;
