-- Fase 2: trazabilidad de hitos en campo para voluntariado externo.
-- Los eventos viven en historial_reporte; estos índices evitan registrar
-- dos veces hitos de una sola ocurrencia para la misma asignación.

CREATE UNIQUE INDEX IF NOT EXISTS uq_historial_llegada_zona_por_responsable
  ON public.historial_reporte (reporte_id, usuario_id)
  WHERE tipo_evento IN ('llegada_zona_reporte', 'hito_llegada_zona_reporte');

COMMENT ON INDEX public.uq_historial_llegada_zona_por_responsable IS
  'Impide duplicar la llegada a la zona del mismo responsable en un reporte.';
