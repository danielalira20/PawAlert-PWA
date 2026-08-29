-- Compatible con instalaciones que ya aplicaron 0079 antes de ampliar el formulario.
ALTER TABLE public.whatsapp_reporte_sesiones
  DROP CONSTRAINT IF EXISTS whatsapp_reporte_sesiones_estado_check;

ALTER TABLE public.whatsapp_reporte_sesiones
  ADD CONSTRAINT whatsapp_reporte_sesiones_estado_check CHECK (
    estado IN (
      'nombre', 'cantidad', 'foto', 'tipo_animal', 'categoria_otro',
      'especie_descripcion', 'condicion', 'tamanio', 'sexo', 'edad', 'raza',
      'tiene_collar', 'comportamiento', 'es_domestico', 'esta_prenada',
      'trae_crias', 'numero_crias', 'descripcion', 'ubicacion', 'referencia',
      'confirmacion', 'duplicado'
    )
  );
