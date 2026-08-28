-- Impide que un reporte validado entre al flujo operativo sin Urgency inicial.

ALTER TABLE public.reportes
  DROP CONSTRAINT IF EXISTS reportes_estado_validacion_reporte_check,
  ADD CONSTRAINT reportes_estado_validacion_reporte_check CHECK (
    estado_validacion_reporte IN (
      'procesando', 'urgency_pendiente', 'aprobado', 'revision_manual', 'rechazado'
    )
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
    WHERE (
        estado_validacion_reporte = 'urgency_pendiente'
        OR (
          estado_validacion_reporte = 'aprobado'
          AND estado_reporte::text IN (
            'pendiente', 'asignado', 'en_camino', 'en_atencion', 'sin_cobertura'
          )
          AND urgency_proximo_recalculo_at <= now()
        )
      )
      AND urgency_excluido = false
      AND id NOT IN (SELECT c.reporte_id FROM urgency_report_claims c)
    ORDER BY
      CASE WHEN estado_validacion_reporte = 'urgency_pendiente' THEN 0 ELSE 1 END,
      urgency_proximo_recalculo_at ASC NULLS FIRST
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  INSERT INTO urgency_report_claims (reporte_id, run_id, claimed_at, expires_at)
  SELECT id, p_run_id, now(), now() + interval '10 minutes'
  FROM claimable
  RETURNING urgency_report_claims.reporte_id;
END;
$$;

COMMENT ON FUNCTION public.claim_due_urgency_reports(uuid, integer) IS
  'Prioriza reportes detenidos por Urgency inicial y reclama recalculos operativos vencidos.';

REVOKE EXECUTE ON FUNCTION public.claim_due_urgency_reports(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_urgency_reports(uuid, integer)
  TO service_role;

NOTIFY pgrst, 'reload schema';
