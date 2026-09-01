-- Automatizacion idempotente del ciclo de vida de eventos y recordatorios.
-- El scheduler externo solo reclama trabajo; cada evento se procesa de forma
-- atomica y las notificaciones se escriben en el outbox existente.

BEGIN;

CREATE INDEX IF NOT EXISTS eventos_asociacion_ciclo_vida_idx
  ON public.eventos_asociacion(estado, termina_at, inicia_at, id)
  WHERE estado IN ('publicado', 'finalizado');

CREATE INDEX IF NOT EXISTS eventos_guardados_evento_usuario_idx
  ON public.eventos_guardados(evento_id, usuario_id);

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
  ON CONFLICT (evento_id) DO NOTHING
  RETURNING eventos_asociacion_claims.evento_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.procesar_ciclo_vida_evento_asociacion(
  p_evento_id uuid,
  p_run_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_evento public.eventos_asociacion%ROWTYPE;
  v_asociacion_activa boolean;
  v_asociacion_verificada boolean;
  v_accion text := 'omitido';
  v_notificaciones integer := 0;
BEGIN
  IF p_evento_id IS NULL OR p_run_id IS NULL THEN
    RAISE EXCEPTION 'proceso_evento_parametros_invalidos'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.eventos_asociacion_claims claim
    JOIN public.operaciones_modulo_runs run ON run.id = claim.run_id
    WHERE claim.evento_id = p_evento_id
      AND claim.run_id = p_run_id
      AND claim.expires_at >= now()
      AND run.tipo_job = 'ciclo_vida_eventos'
      AND run.estado = 'en_progreso'
  ) THEN
    RAISE EXCEPTION 'claim_evento_no_disponible' USING ERRCODE = 'P0002';
  END IF;

  SELECT evento.*
  INTO v_evento
  FROM public.eventos_asociacion evento
  WHERE evento.id = p_evento_id
  FOR UPDATE OF evento;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'evento_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(asociacion.activo, false),
    COALESCE(asociacion.verificado, false)
  INTO v_asociacion_activa, v_asociacion_verificada
  FROM public.asociaciones asociacion
  WHERE asociacion.id = v_evento.asociacion_id;

  IF v_evento.estado = 'publicado' AND v_evento.termina_at <= now() THEN
    UPDATE public.eventos_asociacion
    SET estado = 'finalizado',
        finalizado_at = COALESCE(finalizado_at, now()),
        actualizada_at = now()
    WHERE id = p_evento_id;

    INSERT INTO public.historial_evento (
      evento_id, asociacion_id, actor_usuario_id, tipo_evento,
      estado_anterior, estado_nuevo, datos_extra, version_publica,
      idempotency_key
    ) VALUES (
      v_evento.id, v_evento.asociacion_id, NULL, 'evento_finalizado',
      'publicado', 'finalizado', jsonb_build_object(
        'origen', 'ciclo_vida_eventos', 'termina_at', v_evento.termina_at
      ), v_evento.version_publica,
      'evento:ciclo:finalizado:' || v_evento.id::text
    )
    ON CONFLICT (asociacion_id, idempotency_key) DO NOTHING;

    INSERT INTO public.notificaciones_push (
      usuario_id, evento_id, tipo_evento, payload, idempotency_key
    )
    SELECT guardado.usuario_id, v_evento.id, 'evento_finalizado',
      jsonb_build_object(
        'evento_id', v_evento.id,
        'tipo_evento', 'evento_finalizado',
        'titulo', v_evento.titulo,
        'termina_at', v_evento.termina_at,
        'zona_horaria', v_evento.zona_horaria
      ),
      'evento:finalizado:' || v_evento.id::text
    FROM public.eventos_guardados guardado
    WHERE guardado.evento_id = v_evento.id
    ON CONFLICT (usuario_id, idempotency_key) DO NOTHING;
    GET DIAGNOSTICS v_notificaciones = ROW_COUNT;
    v_accion := 'finalizado';

  ELSIF v_evento.estado = 'finalizado'
      AND v_evento.termina_at <= now() - interval '30 days' THEN
    UPDATE public.eventos_asociacion
    SET estado = 'archivado',
        archivado_at = COALESCE(archivado_at, now()),
        actualizada_at = now()
    WHERE id = p_evento_id;

    INSERT INTO public.historial_evento (
      evento_id, asociacion_id, actor_usuario_id, tipo_evento,
      estado_anterior, estado_nuevo, datos_extra, version_publica,
      idempotency_key
    ) VALUES (
      v_evento.id, v_evento.asociacion_id, NULL, 'evento_archivado',
      'finalizado', 'archivado', jsonb_build_object(
        'origen', 'ciclo_vida_eventos', 'retencion_dias', 30
      ), v_evento.version_publica,
      'evento:ciclo:archivado:' || v_evento.id::text
    )
    ON CONFLICT (asociacion_id, idempotency_key) DO NOTHING;
    v_accion := 'archivado';

  ELSIF v_evento.estado = 'publicado'
      AND v_evento.inicia_at > now()
      AND v_evento.inicia_at <= now() + interval '24 hours'
      AND v_asociacion_activa
      AND v_asociacion_verificada THEN
    INSERT INTO public.notificaciones_push (
      usuario_id, evento_id, tipo_evento, payload, idempotency_key
    )
    SELECT guardado.usuario_id, v_evento.id, 'evento_recordatorio_24h',
      jsonb_build_object(
        'evento_id', v_evento.id,
        'tipo_evento', 'evento_recordatorio_24h',
        'titulo', v_evento.titulo,
        'inicia_at', v_evento.inicia_at,
        'zona_horaria', v_evento.zona_horaria,
        'cupo_estado', v_evento.cupo_estado,
        'reserva_cupo', false
      ),
      'evento:recordatorio:24h:' || v_evento.id::text || ':'
        || extract(epoch FROM v_evento.inicia_at)::bigint::text
    FROM public.eventos_guardados guardado
    WHERE guardado.evento_id = v_evento.id
    ON CONFLICT (usuario_id, idempotency_key) DO NOTHING;
    GET DIAGNOSTICS v_notificaciones = ROW_COUNT;
    v_accion := CASE
      WHEN v_notificaciones > 0 THEN 'recordatorio_24h'
      ELSE 'omitido'
    END;
  END IF;

  RETURN jsonb_build_object(
    'evento_id', v_evento.id,
    'accion', v_accion,
    'notificaciones_encoladas', v_notificaciones
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_evento_asociacion_claim(
  p_evento_id uuid,
  p_run_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.eventos_asociacion_claims
  WHERE evento_id = p_evento_id AND run_id = p_run_id;
END;
$$;

REVOKE ALL ON FUNCTION
  public.claim_due_eventos_asociacion(uuid, integer),
  public.procesar_ciclo_vida_evento_asociacion(uuid, uuid),
  public.release_evento_asociacion_claim(uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.claim_due_eventos_asociacion(uuid, integer),
  public.procesar_ciclo_vida_evento_asociacion(uuid, uuid),
  public.release_evento_asociacion_claim(uuid, uuid)
TO service_role;

COMMENT ON FUNCTION public.claim_due_eventos_asociacion(uuid, integer) IS
  'Reclama con SKIP LOCKED eventos vencidos, archivables o con recordatorios pendientes.';

COMMENT ON FUNCTION public.procesar_ciclo_vida_evento_asociacion(uuid, uuid) IS
  'Finaliza, archiva o encola recordatorios de un evento reclamado de forma atomica.';

COMMIT;

NOTIFY pgrst, 'reload schema';
