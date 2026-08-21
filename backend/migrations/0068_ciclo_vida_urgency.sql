-- Mantiene el resultado vigente de Urgency alineado con el ciclo de vida del
-- reporte. El historial de evaluaciones se conserva para auditoria.

CREATE OR REPLACE FUNCTION public.excluir_urgency_en_estado_terminal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.estado_reporte::text IN (
    'rescatado', 'cerrado', 'cancelado_por_reportante', 'duplicado',
    'duplicado_vinculable', 'duplicado_informativo', 'muerto'
  ) THEN
    NEW.urgency_score := NULL;
    NEW.urgency_nivel := NULL;
    NEW.urgency_calculado_at := NULL;
    NEW.urgency_proximo_recalculo_at := NULL;
    NEW.urgency_excluido := true;
    NEW.urgency_razones_exclusion := jsonb_build_array(
      jsonb_build_object(
        'codigo', 'estado_terminal',
        'estado_reporte', NEW.estado_reporte::text
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reportes_excluir_urgency_terminal_trigger
  ON public.reportes;

CREATE TRIGGER reportes_excluir_urgency_terminal_trigger
BEFORE UPDATE OF estado_reporte
ON public.reportes
FOR EACH ROW
EXECUTE FUNCTION public.excluir_urgency_en_estado_terminal();

UPDATE public.reportes
SET
  urgency_score = NULL,
  urgency_nivel = NULL,
  urgency_calculado_at = NULL,
  urgency_proximo_recalculo_at = NULL,
  urgency_excluido = true,
  urgency_razones_exclusion = jsonb_build_array(
    jsonb_build_object(
      'codigo', 'estado_terminal',
      'estado_reporte', estado_reporte::text
    )
  )
WHERE estado_reporte::text IN (
  'rescatado', 'cerrado', 'cancelado_por_reportante', 'duplicado',
  'duplicado_vinculable', 'duplicado_informativo', 'muerto'
);

CREATE OR REPLACE FUNCTION public.claim_due_urgency_reports(
  p_run_id uuid,
  p_limit integer DEFAULT 10
) RETURNS TABLE(reporte_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM urgency_report_claims WHERE expires_at < now();

  RETURN QUERY
  WITH claimable AS (
    SELECT id
    FROM reportes
    WHERE estado_validacion_reporte = 'aprobado'
      AND estado_reporte::text IN (
        'pendiente', 'asignado', 'en_camino', 'en_atencion', 'sin_cobertura'
      )
      AND urgency_excluido = false
      AND urgency_proximo_recalculo_at <= now()
      AND id NOT IN (SELECT c.reporte_id FROM urgency_report_claims c)
    ORDER BY urgency_proximo_recalculo_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  INSERT INTO urgency_report_claims (reporte_id, run_id, claimed_at, expires_at)
  SELECT id, p_run_id, now(), now() + interval '10 minutes'
  FROM claimable
  RETURNING urgency_report_claims.reporte_id;
END;
$$;

COMMENT ON FUNCTION public.excluir_urgency_en_estado_terminal() IS
  'Limpia el resultado vigente y detiene recalculos de Urgency al terminar un reporte.';
