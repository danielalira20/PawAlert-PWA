-- Agrega el estado 'modo_grupo': cuando se reportan 2+ animales el bot pregunta
-- si es una mamá con crías, un grupo parecido o animales distintos.
ALTER TABLE public.whatsapp_reporte_sesiones
  DROP CONSTRAINT IF EXISTS whatsapp_reporte_sesiones_estado_check;

ALTER TABLE public.whatsapp_reporte_sesiones
  ADD CONSTRAINT whatsapp_reporte_sesiones_estado_check CHECK (
    estado IN (
      'nombre', 'cantidad', 'modo_grupo', 'foto', 'tipo_animal', 'categoria_otro',
      'especie_descripcion', 'condicion', 'tamanio', 'sexo', 'edad', 'raza',
      'tiene_collar', 'comportamiento', 'es_domestico', 'esta_prenada',
      'trae_crias', 'numero_crias', 'descripcion', 'ubicacion', 'referencia',
      'confirmacion', 'correccion', 'duplicado'
    )
  );
