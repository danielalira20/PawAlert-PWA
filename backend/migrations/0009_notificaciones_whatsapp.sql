-- Cola desacoplada de avisos de WhatsApp.
--
-- Las acciones de PawAlert se completan antes de crear o enviar un aviso.
-- Un fallo de Twilio nunca revierte horarios, visitas ni postulaciones.

BEGIN;

CREATE TABLE IF NOT EXISTS public.notificaciones_whatsapp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento character varying NOT NULL,
  dedupe_key character varying NOT NULL UNIQUE,
  destinatario_tipo character varying NOT NULL
    CHECK (destinatario_tipo IN ('voluntario', 'postulante', 'asociacion')),
  destinatario_id uuid NOT NULL,
  telefono character varying NOT NULL,
  mensaje text NOT NULL,
  enlace text,
  estado character varying NOT NULL DEFAULT 'pendiente'
    CHECK (
      estado IN (
        'pendiente',
        'enviando',
        'enviado',
        'entregado',
        'leido',
        'fallido'
      )
    ),
  intentos integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  twilio_message_sid character varying UNIQUE,
  ultimo_error text,
  programada_at timestamp with time zone NOT NULL DEFAULT now(),
  enviada_at timestamp with time zone,
  entregada_at timestamp with time zone,
  leida_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notificaciones_whatsapp_pendientes_idx
  ON public.notificaciones_whatsapp(estado, programada_at);

CREATE INDEX IF NOT EXISTS notificaciones_whatsapp_destinatario_idx
  ON public.notificaciones_whatsapp(destinatario_tipo, destinatario_id);

COMMIT;
