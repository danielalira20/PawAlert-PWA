-- Límite de intentos en el pre-check de Gemini Vision (POST
-- /reports/validar-foto): 3 rechazos reales de contenido por
-- device_token bloquean el pre-check de ese dispositivo por 5 minutos.
-- Sin limpieza automática, mismo criterio que tokens_invitacion/
-- verificaciones_telefono.

BEGIN;

CREATE TABLE IF NOT EXISTS public.intentos_validacion_foto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_token varchar NOT NULL UNIQUE,
  contador_rechazos smallint NOT NULL DEFAULT 0,
  bloqueado_hasta timestamptz,
  actualizado_at timestamptz NOT NULL DEFAULT now()
);

NOTIFY pgrst, 'reload schema';

COMMIT;
