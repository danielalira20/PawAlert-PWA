-- Agrega el estado 'correccion' que usa el menú "Corregir datos" antes de confirmar.
-- Sin esto, _guardar_sesion(wa_id, "correccion", ...) viola el CHECK y rompe el bot.
ALTER TABLE public.whatsapp_reporte_sesiones
  DROP CONSTRAINT IF EXISTS whatsapp_reporte_sesiones_estado_check;

ALTER TABLE public.whatsapp_reporte_sesiones
  ADD CONSTRAINT whatsapp_reporte_sesiones_estado_check CHECK (
    estado IN (
      'nombre', 'cantidad', 'foto', 'tipo_animal', 'categoria_otro',
      'especie_descripcion', 'condicion', 'tamanio', 'sexo', 'edad', 'raza',
      'tiene_collar', 'comportamiento', 'es_domestico', 'esta_prenada',
      'trae_crias', 'numero_crias', 'descripcion', 'ubicacion', 'referencia',
      'confirmacion', 'correccion', 'duplicado'
    )
  );
