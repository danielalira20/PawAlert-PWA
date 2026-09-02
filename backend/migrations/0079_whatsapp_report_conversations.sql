-- Estado privado del formulario conversacional de reportes por WhatsApp.
-- Sólo el backend con service_role accede a estas tablas.

CREATE TABLE IF NOT EXISTS public.whatsapp_reporte_sesiones (
  wa_id text PRIMARY KEY,
  estado text NOT NULL CHECK (
    estado IN (
      'nombre', 'cantidad', 'foto', 'tipo_animal', 'categoria_otro',
      'especie_descripcion', 'condicion', 'tamanio', 'sexo', 'edad', 'raza',
      'tiene_collar', 'comportamiento', 'es_domestico', 'esta_prenada',
      'trae_crias', 'numero_crias', 'descripcion', 'ubicacion', 'referencia',
      'confirmacion', 'duplicado'
    )
  ),
  respuestas jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_at timestamptz NOT NULL DEFAULT now(),
  actualizado_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_mensajes_recibidos (
  message_id text PRIMARY KEY,
  wa_id text NOT NULL,
  recibido_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_sesiones_actualizado_idx
  ON public.whatsapp_reporte_sesiones (actualizado_at);
CREATE INDEX IF NOT EXISTS whatsapp_mensajes_recibido_idx
  ON public.whatsapp_mensajes_recibidos (recibido_at);

ALTER TABLE public.whatsapp_reporte_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_mensajes_recibidos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_reporte_sesiones FROM anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_mensajes_recibidos FROM anon, authenticated;
