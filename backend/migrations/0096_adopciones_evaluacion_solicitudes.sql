-- Operaciones atomicas para que una asociacion evalue solicitudes de adopcion.
-- La seleccion bloquea primero el perfil y conserva intactas las solicitudes
-- no elegidas hasta que se confirme la entrega.

BEGIN;

CREATE OR REPLACE FUNCTION public.solicitar_informacion_solicitud_adopcion(
  p_solicitud_adopcion_id uuid,
  p_asociacion_id uuid,
  p_actor_usuario_id uuid,
  p_informacion_solicitada text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_solicitud public.solicitudes_adopcion%ROWTYPE;
  v_evento public.historial_adopcion%ROWTYPE;
  v_estado_anterior text;
  v_payload_hash text;
BEGIN
  IF p_solicitud_adopcion_id IS NULL
     OR p_asociacion_id IS NULL
     OR p_actor_usuario_id IS NULL
     OR length(trim(COALESCE(p_informacion_solicitada, '')))
       NOT BETWEEN 1 AND 2000
     OR length(trim(COALESCE(p_idempotency_key, '')))
       NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'solicitud_informacion_adopcion_incompleta'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_asociacion_operativa(
    p_actor_usuario_id,
    p_asociacion_id
  );

  SELECT *
  INTO v_solicitud
  FROM public.solicitudes_adopcion
  WHERE id = p_solicitud_adopcion_id
    AND asociacion_id = p_asociacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitud_adopcion_no_encontrada_asociacion'
      USING ERRCODE = 'P0002';
  END IF;

  v_payload_hash := encode(
    digest(
      v_solicitud.id::text || '|' || trim(p_informacion_solicitada),
      'sha256'
    ),
    'hex'
  );

  SELECT *
  INTO v_evento
  FROM public.historial_adopcion
  WHERE asociacion_id = p_asociacion_id
    AND idempotency_key =
      'solicitud:informacion:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_evento.solicitud_adopcion_id IS DISTINCT FROM v_solicitud.id
       OR v_evento.datos_extra->>'payload_hash'
         IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'idempotency_key_informacion_adopcion_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object(
      'id', v_solicitud.id,
      'estado', v_solicitud.estado,
      'updated_at', v_solicitud.actualizada_at,
      'event_id', v_evento.id,
      'reintento', true
    );
  END IF;

  IF v_solicitud.estado NOT IN (
    'enviada', 'en_evaluacion', 'entrevista_programada'
  ) THEN
    RAISE EXCEPTION 'solicitud_adopcion_no_admite_informacion'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_solicitud.vencimiento_at IS NOT NULL
     AND v_solicitud.vencimiento_at <= now() THEN
    RAISE EXCEPTION 'solicitud_adopcion_vencida'
      USING ERRCODE = 'P0001';
  END IF;

  v_estado_anterior := v_solicitud.estado;
  UPDATE public.solicitudes_adopcion
  SET estado = 'requiere_informacion',
      informacion_solicitada = trim(p_informacion_solicitada),
      informacion_solicitada_at = now(),
      entrevista_programada_at = NULL,
      entrevista_modalidad = NULL,
      entrevista_detalle_privado = NULL
  WHERE id = v_solicitud.id
  RETURNING * INTO v_solicitud;

  INSERT INTO public.historial_adopcion (
    asociacion_id,
    perfil_adopcion_id,
    solicitud_adopcion_id,
    actor_usuario_id,
    tipo_evento,
    estado_anterior,
    estado_nuevo,
    motivo,
    datos_extra,
    idempotency_key
  ) VALUES (
    p_asociacion_id,
    v_solicitud.perfil_adopcion_id,
    v_solicitud.id,
    p_actor_usuario_id,
    'solicitud_adopcion_requiere_informacion',
    v_estado_anterior,
    'requiere_informacion',
    trim(p_informacion_solicitada),
    jsonb_build_object('payload_hash', v_payload_hash),
    'solicitud:informacion:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key)
  ) RETURNING * INTO v_evento;

  BEGIN
    PERFORM public.encolar_notificacion_modulo(
      v_solicitud.solicitante_usuario_id,
      'solicitud_adopcion_requiere_informacion',
      'adopcion:solicitud:informacion:' || v_evento.id::text,
      jsonb_build_object(
        'solicitud_adopcion_id', v_solicitud.id,
        'perfil_adopcion_id', v_solicitud.perfil_adopcion_id,
        'estado', v_solicitud.estado
      ),
      NULL,
      v_solicitud.perfil_adopcion_id,
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING
      'No se pudo encolar solicitud_adopcion_requiere_informacion: %',
      SQLERRM;
  END;

  RETURN jsonb_build_object(
    'id', v_solicitud.id,
    'estado', v_solicitud.estado,
    'updated_at', v_solicitud.actualizada_at,
    'event_id', v_evento.id,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.seleccionar_solicitud_adopcion(
  p_solicitud_adopcion_id uuid,
  p_asociacion_id uuid,
  p_actor_usuario_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_perfil_id uuid;
  v_perfil public.perfiles_adopcion%ROWTYPE;
  v_solicitud public.solicitudes_adopcion%ROWTYPE;
  v_evento public.historial_adopcion%ROWTYPE;
  v_estado_anterior text;
  v_payload_hash text;
  v_otra_seleccionada_id uuid;
BEGIN
  IF p_solicitud_adopcion_id IS NULL
     OR p_asociacion_id IS NULL
     OR p_actor_usuario_id IS NULL
     OR length(trim(COALESCE(p_idempotency_key, '')))
       NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'seleccion_solicitud_adopcion_incompleta'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_asociacion_operativa(
    p_actor_usuario_id,
    p_asociacion_id
  );

  SELECT perfil_adopcion_id
  INTO v_perfil_id
  FROM public.solicitudes_adopcion
  WHERE id = p_solicitud_adopcion_id
    AND asociacion_id = p_asociacion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitud_adopcion_no_encontrada_asociacion'
      USING ERRCODE = 'P0002';
  END IF;

  -- Todas las selecciones del mismo perfil compiten por el mismo bloqueo.
  SELECT *
  INTO v_perfil
  FROM public.perfiles_adopcion
  WHERE id = v_perfil_id
    AND asociacion_id = p_asociacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'perfil_adopcion_no_encontrado'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_solicitud
  FROM public.solicitudes_adopcion
  WHERE id = p_solicitud_adopcion_id
    AND perfil_adopcion_id = v_perfil.id
    AND asociacion_id = p_asociacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitud_adopcion_no_encontrada_asociacion'
      USING ERRCODE = 'P0002';
  END IF;

  v_payload_hash := encode(
    digest(v_solicitud.id::text || '|' || v_perfil.id::text, 'sha256'),
    'hex'
  );

  SELECT *
  INTO v_evento
  FROM public.historial_adopcion
  WHERE asociacion_id = p_asociacion_id
    AND idempotency_key =
      'solicitud:seleccionar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_evento.solicitud_adopcion_id IS DISTINCT FROM v_solicitud.id
       OR v_evento.datos_extra->>'payload_hash'
         IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'idempotency_key_seleccion_adopcion_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object(
      'id', v_solicitud.id,
      'estado', v_solicitud.estado,
      'perfil_adopcion_id', v_perfil.id,
      'perfil_estado', v_perfil.estado,
      'updated_at', v_solicitud.actualizada_at,
      'event_id', v_evento.id,
      'reintento', true
    );
  END IF;

  IF v_perfil.estado NOT IN ('publicado', 'pausado')
     OR v_perfil.estado_moderacion <> 'visible' THEN
    RAISE EXCEPTION 'perfil_adopcion_no_admite_seleccion'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_solicitud.estado NOT IN (
    'enviada', 'en_evaluacion', 'entrevista_programada'
  ) THEN
    RAISE EXCEPTION 'solicitud_adopcion_no_seleccionable'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_solicitud.vencimiento_at IS NOT NULL
     AND v_solicitud.vencimiento_at <= now() THEN
    RAISE EXCEPTION 'solicitud_adopcion_vencida'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id
  INTO v_otra_seleccionada_id
  FROM public.solicitudes_adopcion
  WHERE perfil_adopcion_id = v_perfil.id
    AND estado = 'seleccionada'
    AND id <> v_solicitud.id
  LIMIT 1;

  IF v_otra_seleccionada_id IS NOT NULL THEN
    RAISE EXCEPTION 'perfil_adopcion_seleccion_en_conflicto'
      USING ERRCODE = 'P0001';
  END IF;

  v_estado_anterior := v_solicitud.estado;
  UPDATE public.perfiles_adopcion
  SET estado = 'en_proceso'
  WHERE id = v_perfil.id
  RETURNING * INTO v_perfil;

  UPDATE public.solicitudes_adopcion
  SET estado = 'seleccionada',
      seleccionada_por_usuario_id = p_actor_usuario_id,
      seleccionada_at = now(),
      vencimiento_at = NULL
  WHERE id = v_solicitud.id
  RETURNING * INTO v_solicitud;

  INSERT INTO public.historial_adopcion (
    asociacion_id,
    perfil_adopcion_id,
    solicitud_adopcion_id,
    actor_usuario_id,
    tipo_evento,
    estado_anterior,
    estado_nuevo,
    datos_extra,
    idempotency_key
  ) VALUES (
    p_asociacion_id,
    v_perfil.id,
    v_solicitud.id,
    p_actor_usuario_id,
    'solicitud_adopcion_seleccionada',
    v_estado_anterior,
    'seleccionada',
    jsonb_build_object(
      'payload_hash', v_payload_hash,
      'perfil_estado_nuevo', 'en_proceso'
    ),
    'solicitud:seleccionar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key)
  ) RETURNING * INTO v_evento;

  BEGIN
    PERFORM public.encolar_notificacion_modulo(
      v_solicitud.solicitante_usuario_id,
      'solicitud_adopcion_seleccionada',
      'adopcion:solicitud:seleccionada:' || v_evento.id::text,
      jsonb_build_object(
        'solicitud_adopcion_id', v_solicitud.id,
        'perfil_adopcion_id', v_perfil.id,
        'estado', v_solicitud.estado
      ),
      NULL,
      v_perfil.id,
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'No se pudo encolar solicitud_adopcion_seleccionada: %',
      SQLERRM;
  END;

  RETURN jsonb_build_object(
    'id', v_solicitud.id,
    'estado', v_solicitud.estado,
    'perfil_adopcion_id', v_perfil.id,
    'perfil_estado', v_perfil.estado,
    'updated_at', v_solicitud.actualizada_at,
    'event_id', v_evento.id,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rechazar_solicitud_adopcion(
  p_solicitud_adopcion_id uuid,
  p_asociacion_id uuid,
  p_actor_usuario_id uuid,
  p_motivo_interno text,
  p_categoria_publica text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_solicitud public.solicitudes_adopcion%ROWTYPE;
  v_evento public.historial_adopcion%ROWTYPE;
  v_estado_anterior text;
  v_payload_hash text;
BEGIN
  IF p_solicitud_adopcion_id IS NULL
     OR p_asociacion_id IS NULL
     OR p_actor_usuario_id IS NULL
     OR length(trim(COALESCE(p_motivo_interno, '')))
       NOT BETWEEN 1 AND 2000
     OR trim(COALESCE(p_categoria_publica, '')) NOT IN (
       'requisitos_no_cumplidos',
       'condiciones_no_compatibles',
       'proceso_incompleto',
       'otro'
     )
     OR length(trim(COALESCE(p_idempotency_key, '')))
       NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'rechazo_solicitud_adopcion_incompleto'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_asociacion_operativa(
    p_actor_usuario_id,
    p_asociacion_id
  );

  SELECT *
  INTO v_solicitud
  FROM public.solicitudes_adopcion
  WHERE id = p_solicitud_adopcion_id
    AND asociacion_id = p_asociacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitud_adopcion_no_encontrada_asociacion'
      USING ERRCODE = 'P0002';
  END IF;

  v_payload_hash := encode(
    digest(
      v_solicitud.id::text || '|' || trim(p_motivo_interno) || '|'
      || trim(p_categoria_publica),
      'sha256'
    ),
    'hex'
  );

  SELECT *
  INTO v_evento
  FROM public.historial_adopcion
  WHERE asociacion_id = p_asociacion_id
    AND idempotency_key =
      'solicitud:rechazar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_evento.solicitud_adopcion_id IS DISTINCT FROM v_solicitud.id
       OR v_evento.datos_extra->>'payload_hash'
         IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'idempotency_key_rechazo_adopcion_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object(
      'id', v_solicitud.id,
      'estado', v_solicitud.estado,
      'categoria_rechazo_publica', v_solicitud.categoria_rechazo_publica,
      'updated_at', v_solicitud.actualizada_at,
      'event_id', v_evento.id,
      'reintento', true
    );
  END IF;

  IF v_solicitud.estado NOT IN (
    'enviada', 'requiere_informacion',
    'en_evaluacion', 'entrevista_programada'
  ) THEN
    RAISE EXCEPTION 'solicitud_adopcion_no_rechazable'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_solicitud.vencimiento_at IS NOT NULL
     AND v_solicitud.vencimiento_at <= now() THEN
    RAISE EXCEPTION 'solicitud_adopcion_vencida'
      USING ERRCODE = 'P0001';
  END IF;

  v_estado_anterior := v_solicitud.estado;
  UPDATE public.solicitudes_adopcion
  SET estado = 'rechazada',
      informacion_solicitada = NULL,
      informacion_solicitada_at = NULL,
      entrevista_programada_at = NULL,
      entrevista_modalidad = NULL,
      entrevista_detalle_privado = NULL,
      motivo_rechazo_interno = trim(p_motivo_interno),
      categoria_rechazo_publica = trim(p_categoria_publica),
      rechazada_por_usuario_id = p_actor_usuario_id,
      rechazada_at = now()
  WHERE id = v_solicitud.id
  RETURNING * INTO v_solicitud;

  INSERT INTO public.historial_adopcion (
    asociacion_id,
    perfil_adopcion_id,
    solicitud_adopcion_id,
    actor_usuario_id,
    tipo_evento,
    estado_anterior,
    estado_nuevo,
    motivo,
    datos_extra,
    idempotency_key
  ) VALUES (
    p_asociacion_id,
    v_solicitud.perfil_adopcion_id,
    v_solicitud.id,
    p_actor_usuario_id,
    'solicitud_adopcion_rechazada',
    v_estado_anterior,
    'rechazada',
    trim(p_motivo_interno),
    jsonb_build_object(
      'payload_hash', v_payload_hash,
      'categoria_rechazo_publica', trim(p_categoria_publica)
    ),
    'solicitud:rechazar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key)
  ) RETURNING * INTO v_evento;

  BEGIN
    PERFORM public.encolar_notificacion_modulo(
      v_solicitud.solicitante_usuario_id,
      'solicitud_adopcion_rechazada',
      'adopcion:solicitud:rechazada:' || v_evento.id::text,
      jsonb_build_object(
        'solicitud_adopcion_id', v_solicitud.id,
        'perfil_adopcion_id', v_solicitud.perfil_adopcion_id,
        'estado', v_solicitud.estado,
        'categoria_rechazo_publica', v_solicitud.categoria_rechazo_publica
      ),
      NULL,
      v_solicitud.perfil_adopcion_id,
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'No se pudo encolar solicitud_adopcion_rechazada: %',
      SQLERRM;
  END;

  RETURN jsonb_build_object(
    'id', v_solicitud.id,
    'estado', v_solicitud.estado,
    'categoria_rechazo_publica', v_solicitud.categoria_rechazo_publica,
    'updated_at', v_solicitud.actualizada_at,
    'event_id', v_evento.id,
    'reintento', false
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.solicitar_informacion_solicitud_adopcion(uuid, uuid, uuid, text, text),
  public.seleccionar_solicitud_adopcion(uuid, uuid, uuid, text),
  public.rechazar_solicitud_adopcion(uuid, uuid, uuid, text, text, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.solicitar_informacion_solicitud_adopcion(uuid, uuid, uuid, text, text),
  public.seleccionar_solicitud_adopcion(uuid, uuid, uuid, text),
  public.rechazar_solicitud_adopcion(uuid, uuid, uuid, text, text, text)
TO service_role;

COMMENT ON FUNCTION public.solicitar_informacion_solicitud_adopcion(
  uuid, uuid, uuid, text, text
) IS 'Solicita una aclaracion sin exponer su texto en la notificacion.';

COMMENT ON FUNCTION public.seleccionar_solicitud_adopcion(
  uuid, uuid, uuid, text
) IS 'Selecciona un adoptante y bloquea atomicamente nuevas solicitudes del perfil.';

COMMENT ON FUNCTION public.rechazar_solicitud_adopcion(
  uuid, uuid, uuid, text, text, text
) IS 'Rechaza una solicitud conservando separado el motivo interno de la categoria publica.';

COMMIT;

NOTIFY pgrst, 'reload schema';
