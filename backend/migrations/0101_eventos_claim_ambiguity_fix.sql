-- Corrige la ambiguedad entre el parametro de salida `evento_id` de
-- RETURNS TABLE y la columna homonima usada por ON CONFLICT en 0100.

BEGIN;

CREATE OR REPLACE FUNCTION public.claim_due_eventos_asociacion(
  p_run_id uuid,
  p_limit integer DEFAULT 10
) RETURNS TABLE(evento_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_run_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'claim_eventos_parametros_invalidos'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.operaciones_modulo_runs run
    WHERE run.id = p_run_id
      AND run.tipo_job = 'ciclo_vida_eventos'
      AND run.estado = 'en_progreso'
  ) THEN
    RAISE EXCEPTION 'run_ciclo_vida_eventos_no_disponible'
      USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.eventos_asociacion_claims
  WHERE expires_at < now();

  RETURN QUERY
  WITH claimable AS (
    SELECT evento.id
    FROM public.eventos_asociacion evento
    LEFT JOIN public.asociaciones asociacion
      ON asociacion.id = evento.asociacion_id
    WHERE evento.id NOT IN (
      SELECT claim.evento_id
      FROM public.eventos_asociacion_claims claim
    )
      AND (
        (evento.estado = 'publicado' AND evento.termina_at <= now())
        OR (
          evento.estado = 'finalizado'
          AND evento.termina_at <= now() - interval '30 days'
        )
        OR (
          evento.estado = 'publicado'
          AND evento.inicia_at > now()
          AND evento.inicia_at <= now() + interval '24 hours'
          AND COALESCE(asociacion.activo, false) = true
          AND COALESCE(asociacion.verificado, false) = true
          AND EXISTS (
            SELECT 1
            FROM public.eventos_guardados guardado
            WHERE guardado.evento_id = evento.id
              AND NOT EXISTS (
                SELECT 1
                FROM public.notificaciones_push notificacion
                WHERE notificacion.usuario_id = guardado.usuario_id
                  AND notificacion.idempotency_key =
                    'evento:recordatorio:24h:' || evento.id::text || ':'
                    || extract(epoch FROM evento.inicia_at)::bigint::text
              )
          )
        )
      )
    ORDER BY
      CASE
        WHEN evento.estado = 'publicado' AND evento.termina_at <= now()
          THEN 0
        WHEN evento.estado = 'finalizado' THEN 1
        ELSE 2
      END,
      COALESCE(evento.termina_at, evento.inicia_at),
      evento.id
    LIMIT p_limit
    FOR UPDATE OF evento SKIP LOCKED
  )
  INSERT INTO public.eventos_asociacion_claims (
    evento_id, run_id, claimed_at, expires_at
  )
  SELECT id, p_run_id, now(), now() + interval '10 minutes'
  FROM claimable
  ON CONFLICT ON CONSTRAINT eventos_asociacion_claims_pkey DO NOTHING
  RETURNING eventos_asociacion_claims.evento_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_eventos_asociacion(uuid, integer)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_due_eventos_asociacion(uuid, integer)
TO service_role;

COMMENT ON FUNCTION public.claim_due_eventos_asociacion(uuid, integer) IS
  'Reclama eventos con SKIP LOCKED sin ambiguedad entre columna y parametro de salida.';

COMMIT;

NOTIFY pgrst, 'reload schema';
