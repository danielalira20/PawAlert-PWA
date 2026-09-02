-- Conserva una valoración opcional al terminar un reporte por WhatsApp.
CREATE TABLE IF NOT EXISTS public.whatsapp_reporte_valoraciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid NOT NULL UNIQUE REFERENCES public.reportes(id) ON DELETE CASCADE,
  puntuacion smallint NOT NULL CHECK (puntuacion BETWEEN 1 AND 5),
  creado_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_reporte_valoraciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_reporte_valoraciones FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.whatsapp_reporte_valoraciones TO service_role;

ALTER TABLE public.whatsapp_reporte_sesiones
  DROP CONSTRAINT IF EXISTS whatsapp_reporte_sesiones_estado_check;

ALTER TABLE public.whatsapp_reporte_sesiones
  ADD CONSTRAINT whatsapp_reporte_sesiones_estado_check CHECK (
    estado IN (
      'nombre', 'cantidad', 'modo_grupo', 'foto', 'tipo_animal', 'categoria_otro',
      'especie_descripcion', 'condicion', 'tamanio', 'sexo', 'edad', 'raza',
      'tiene_collar', 'comportamiento', 'es_domestico', 'esta_prenada',
      'trae_crias', 'numero_crias', 'descripcion_animal', 'descripcion',
      'ubicacion', 'referencia', 'confirmacion', 'correccion', 'duplicado',
      'procesando_envio', 'valoracion'
    )
  );
