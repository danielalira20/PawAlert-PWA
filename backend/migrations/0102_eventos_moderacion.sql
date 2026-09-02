-- Operaciones atomicas para denuncias y moderacion administrativa de eventos.
-- Las denuncias son privadas; suspender oculta el evento y restaurar lo deja
-- pausado para que la asociacion lo revise antes de volver a publicarlo.

BEGIN;

CREATE OR REPLACE FUNCTION public.reportar_evento_asociacion(
  p_evento_id uuid,
  p_actor_usuario_id uuid,
  p_motivo text,
  p_descripcion text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_evento public.eventos_asociacion%ROWTYPE;
  v_reporte public.reportes_evento_asociacion%ROWTYPE;
BEGIN
  IF p_evento_id IS NULL OR p_actor_usuario_id IS NULL
     OR p_motivo NOT IN (
       'informacion_falsa', 'servicio_riesgoso', 'ubicacion_incorrecta',
       'cobro_no_informado', 'otro'
     )
     OR length(trim(COALESCE(p_descripcion, ''))) NOT BETWEEN 10 AND 2000
     OR length(trim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'reporte_evento_incompleto' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios WHERE id = p_actor_usuario_id
  ) THEN
    RAISE EXCEPTION 'actor_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_evento
  FROM public.eventos_asociacion
  WHERE id = p_evento_id
    AND version_publica > 0
    AND estado NOT IN ('borrador', 'archivado')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'evento_no_disponible_para_reportar'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_reporte
  FROM public.reportes_evento_asociacion
  WHERE reportado_por_usuario_id = p_actor_usuario_id
    AND idempotency_key = trim(p_idempotency_key);

  IF FOUND THEN
    IF v_reporte.evento_id IS DISTINCT FROM p_evento_id
       OR v_reporte.motivo IS DISTINCT FROM p_motivo
       OR v_reporte.descripcion IS DISTINCT FROM trim(p_descripcion) THEN
      RAISE EXCEPTION 'idempotency_key_reporte_evento_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
      'id', v_reporte.id,
      'evento_id', v_reporte.evento_id,
      'motivo', v_reporte.motivo,
      'estado', v_reporte.estado,
      'creado_at', v_reporte.creado_at,
      'reintento', true
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.reportes_evento_asociacion
    WHERE evento_id = p_evento_id
      AND reportado_por_usuario_id = p_actor_usuario_id
      AND estado IN ('pendiente', 'en_revision', 'requiere_informacion')
  ) THEN
    RAISE EXCEPTION 'evento_ya_reportado_abierto' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.reportes_evento_asociacion (
    evento_id,
    reportado_por_usuario_id,
    motivo,
    descripcion,
    idempotency_key
  ) VALUES (
    p_evento_id,
    p_actor_usuario_id,
    p_motivo,
    trim(p_descripcion),
    trim(p_idempotency_key)
  ) RETURNING * INTO v_reporte;

  INSERT INTO public.historial_evento (
    evento_id,
    asociacion_id,
    reporte_evento_id,
    actor_usuario_id,
    tipo_evento,
    estado_anterior,
    estado_nuevo,
    datos_extra,
    version_publica,
    idempotency_key
  ) VALUES (
    v_evento.id,
    v_evento.asociacion_id,
    v_reporte.id,
    NULL,
    'evento_reportado',
    v_evento.estado,
    v_evento.estado,
    jsonb_build_object('motivo', v_reporte.motivo),
    v_evento.version_publica,
    'evento:reportar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key)
  );

  RETURN jsonb_build_object(
    'id', v_reporte.id,
    'evento_id', v_reporte.evento_id,
    'motivo', v_reporte.motivo,
    'estado', v_reporte.estado,
    'creado_at', v_reporte.creado_at,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.suspender_evento_asociacion_admin(
  p_evento_id uuid,
  p_actor_usuario_id uuid,
  p_motivo text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_evento public.eventos_asociacion%ROWTYPE;
  v_historial public.historial_evento%ROWTYPE;
  v_notificaciones integer := 0;
  v_historial_key text;
BEGIN
  IF p_evento_id IS NULL OR p_actor_usuario_id IS NULL
     OR length(trim(COALESCE(p_motivo, ''))) NOT BETWEEN 10 AND 2000
     OR length(trim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'suspension_evento_admin_incompleta'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_administrador(p_actor_usuario_id);
  v_historial_key := 'evento:admin:suspender:' || p_actor_usuario_id::text
    || ':' || trim(p_idempotency_key);

  SELECT * INTO v_historial
  FROM public.historial_evento
  WHERE idempotency_key = v_historial_key;

  IF FOUND THEN
    IF v_historial.evento_id IS DISTINCT FROM p_evento_id THEN
      RAISE EXCEPTION 'idempotency_key_suspension_evento_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_evento
    FROM public.eventos_asociacion
    WHERE id = p_evento_id;

    RETURN jsonb_build_object(
      'id', p_evento_id,
      'estado', v_historial.estado_nuevo,
      'version_publica', v_historial.version_publica,
      'updated_at', v_historial.creado_at,
      'event_id', v_historial.id,
      'reintento', true,
      'notificaciones_encoladas', 0
    );
  END IF;

  SELECT * INTO v_evento
  FROM public.eventos_asociacion
  WHERE id = p_evento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'evento_no_encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF v_evento.estado NOT IN ('publicado', 'pausado') THEN
    RAISE EXCEPTION 'evento_no_suspendible_admin' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.eventos_asociacion
  SET estado = 'suspendido_admin',
      suspendido_at = now(),
      suspendido_por_usuario_id = p_actor_usuario_id,
      motivo_suspension = trim(p_motivo),
      actualizada_at = now()
  WHERE id = p_evento_id;

  UPDATE public.reportes_evento_asociacion
  SET estado = 'en_revision',
      revisado_por_usuario_id = p_actor_usuario_id,
      revisado_at = COALESCE(revisado_at, now()),
      actualizada_at = now()
  WHERE evento_id = p_evento_id
    AND estado = 'pendiente';

  INSERT INTO public.historial_evento (
    evento_id, asociacion_id, actor_usuario_id, tipo_evento,
    estado_anterior, estado_nuevo, motivo, datos_extra, version_publica,
    idempotency_key
  ) VALUES (
    v_evento.id, v_evento.asociacion_id, p_actor_usuario_id,
    'evento_suspendido_admin', v_evento.estado, 'suspendido_admin',
    trim(p_motivo), jsonb_build_object('origen', 'moderacion_admin'),
    v_evento.version_publica, v_historial_key
  ) RETURNING * INTO v_historial;

  INSERT INTO public.notificaciones_push (
    usuario_id, evento_id, tipo_evento, payload, idempotency_key
  )
  SELECT destinatario.usuario_id, v_evento.id, 'evento_suspendido_admin',
    jsonb_build_object(
      'evento_id', v_evento.id,
      'tipo_evento', 'evento_suspendido_admin',
      'titulo', v_evento.titulo,
      'estado', 'suspendido_admin'
    ),
    'evento:suspendido:' || v_evento.id::text || ':'
      || trim(p_idempotency_key)
  FROM (
    SELECT v_evento.creado_por_usuario_id AS usuario_id
    UNION
    SELECT v_evento.responsable_operativo_usuario_id
    WHERE v_evento.responsable_operativo_usuario_id IS NOT NULL
    UNION
    SELECT guardado.usuario_id
    FROM public.eventos_guardados guardado
    WHERE guardado.evento_id = v_evento.id
  ) destinatario
  ON CONFLICT (usuario_id, idempotency_key) DO NOTHING;
  GET DIAGNOSTICS v_notificaciones = ROW_COUNT;

  RETURN jsonb_build_object(
    'id', v_evento.id,
    'estado', 'suspendido_admin',
    'version_publica', v_evento.version_publica,
    'updated_at', v_historial.creado_at,
    'event_id', v_historial.id,
    'reintento', false,
    'notificaciones_encoladas', v_notificaciones
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurar_evento_asociacion_admin(
  p_evento_id uuid,
  p_actor_usuario_id uuid,
  p_resolucion text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_evento public.eventos_asociacion%ROWTYPE;
  v_historial public.historial_evento%ROWTYPE;
  v_notificaciones integer := 0;
  v_historial_key text;
BEGIN
  IF p_evento_id IS NULL OR p_actor_usuario_id IS NULL
     OR length(trim(COALESCE(p_resolucion, ''))) NOT BETWEEN 10 AND 2000
     OR length(trim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'restauracion_evento_admin_incompleta'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_administrador(p_actor_usuario_id);
  v_historial_key := 'evento:admin:restaurar:' || p_actor_usuario_id::text
    || ':' || trim(p_idempotency_key);

  SELECT * INTO v_historial
  FROM public.historial_evento
  WHERE idempotency_key = v_historial_key;

  IF FOUND THEN
    IF v_historial.evento_id IS DISTINCT FROM p_evento_id THEN
      RAISE EXCEPTION 'idempotency_key_restauracion_evento_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
      'id', p_evento_id,
      'estado', v_historial.estado_nuevo,
      'version_publica', v_historial.version_publica,
      'updated_at', v_historial.creado_at,
      'event_id', v_historial.id,
      'reintento', true,
      'notificaciones_encoladas', 0
    );
  END IF;

  SELECT * INTO v_evento
  FROM public.eventos_asociacion
  WHERE id = p_evento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'evento_no_encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF v_evento.estado <> 'suspendido_admin' THEN
    RAISE EXCEPTION 'evento_no_restaurable_admin' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.eventos_asociacion
  SET estado = 'pausado',
      pausado_at = now(),
      actualizada_at = now()
  WHERE id = p_evento_id;

  UPDATE public.reportes_evento_asociacion
  SET estado = 'resuelto',
      revisado_por_usuario_id = p_actor_usuario_id,
      revisado_at = COALESCE(revisado_at, now()),
      resolucion = trim(p_resolucion),
      resuelto_at = now(),
      actualizada_at = now()
  WHERE evento_id = p_evento_id
    AND estado IN ('pendiente', 'en_revision', 'requiere_informacion');

  INSERT INTO public.historial_evento (
    evento_id, asociacion_id, actor_usuario_id, tipo_evento,
    estado_anterior, estado_nuevo, motivo, datos_extra, version_publica,
    idempotency_key
  ) VALUES (
    v_evento.id, v_evento.asociacion_id, p_actor_usuario_id,
    'evento_restaurado_admin', 'suspendido_admin', 'pausado',
    trim(p_resolucion), jsonb_build_object('requiere_republicacion', true),
    v_evento.version_publica, v_historial_key
  ) RETURNING * INTO v_historial;

  INSERT INTO public.notificaciones_push (
    usuario_id, evento_id, tipo_evento, payload, idempotency_key
  )
  SELECT destinatario.usuario_id, v_evento.id, 'evento_restaurado_admin',
    jsonb_build_object(
      'evento_id', v_evento.id,
      'tipo_evento', 'evento_restaurado_admin',
      'titulo', v_evento.titulo,
      'estado', 'pausado',
      'requiere_republicacion', true
    ),
    'evento:restaurado:' || v_evento.id::text || ':'
      || trim(p_idempotency_key)
  FROM (
    SELECT v_evento.creado_por_usuario_id AS usuario_id
    UNION
    SELECT v_evento.responsable_operativo_usuario_id
    WHERE v_evento.responsable_operativo_usuario_id IS NOT NULL
  ) destinatario
  ON CONFLICT (usuario_id, idempotency_key) DO NOTHING;
  GET DIAGNOSTICS v_notificaciones = ROW_COUNT;

  RETURN jsonb_build_object(
    'id', v_evento.id,
    'estado', 'pausado',
    'version_publica', v_evento.version_publica,
    'updated_at', v_historial.creado_at,
    'event_id', v_historial.id,
    'reintento', false,
    'notificaciones_encoladas', v_notificaciones
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.reportar_evento_asociacion(uuid, uuid, text, text, text),
  public.suspender_evento_asociacion_admin(uuid, uuid, text, text),
  public.restaurar_evento_asociacion_admin(uuid, uuid, text, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.reportar_evento_asociacion(uuid, uuid, text, text, text),
  public.suspender_evento_asociacion_admin(uuid, uuid, text, text),
  public.restaurar_evento_asociacion_admin(uuid, uuid, text, text)
TO service_role;

COMMENT ON FUNCTION public.reportar_evento_asociacion(
  uuid, uuid, text, text, text
) IS
  'Registra una denuncia privada idempotente sin revelar al reportante en el historial del evento.';

COMMENT ON FUNCTION public.suspender_evento_asociacion_admin(
  uuid, uuid, text, text
) IS
  'Oculta un evento publicado o pausado, abre sus denuncias a revision y encola avisos seguros.';

COMMENT ON FUNCTION public.restaurar_evento_asociacion_admin(
  uuid, uuid, text, text
) IS
  'Restaura un evento suspendido como pausado, resuelve denuncias abiertas y exige republicacion.';

COMMIT;

NOTIFY pgrst, 'reload schema';
