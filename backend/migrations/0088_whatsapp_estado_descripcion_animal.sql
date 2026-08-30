-- Agrega la descripción opcional que cierra cada ficha en modo "Son diferentes".
ALTER TABLE public.whatsapp_reporte_sesiones
  DROP CONSTRAINT IF EXISTS whatsapp_reporte_sesiones_estado_check;

ALTER TABLE public.whatsapp_reporte_sesiones
  ADD CONSTRAINT whatsapp_reporte_sesiones_estado_check CHECK (
    estado IN (
      'nombre', 'cantidad', 'modo_grupo', 'foto', 'tipo_animal', 'categoria_otro',
      'especie_descripcion', 'condicion', 'tamanio', 'sexo', 'edad', 'raza',
      'tiene_collar', 'comportamiento', 'es_domestico', 'esta_prenada',
      'trae_crias', 'numero_crias', 'descripcion_animal', 'descripcion',
      'ubicacion', 'referencia', 'confirmacion', 'correccion', 'duplicado'
    )
  );
