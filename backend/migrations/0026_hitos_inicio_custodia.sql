-- Fase 3: hitos únicos para el inicio de custodia temporal.

CREATE UNIQUE INDEX IF NOT EXISTS uq_historial_animal_bajo_resguardo
  ON public.historial_reporte (reporte_id, usuario_id)
  WHERE tipo_evento = 'animal_bajo_resguardo';

CREATE UNIQUE INDEX IF NOT EXISTS uq_historial_llegada_hogar_temporal
  ON public.historial_reporte (reporte_id, usuario_id)
  WHERE tipo_evento = 'llegada_hogar_temporal';

COMMENT ON INDEX public.uq_historial_animal_bajo_resguardo IS
  'Evita duplicar la toma de resguardo por responsable y reporte.';

COMMENT ON INDEX public.uq_historial_llegada_hogar_temporal IS
  'Evita iniciar dos veces la custodia del mismo reporte y responsable.';
