-- Imagen principal privada para eventos de asociaciones.
-- Storage queda fuera de la transaccion; estas RPC registran o retiran su
-- referencia de forma atomica, versionada e idempotente.

BEGIN;

INSERT INTO storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
VALUES (
  'pawalert-eventos-privado',
  'pawalert-eventos-privado',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.registrar_imagen_evento_asociacion(
  p_evento_id uuid,
  p_asociacion_id uuid,
  p_actor_usuario_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_texto_alternativo text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_anterior public.eventos_asociacion%ROWTYPE;
  v_evento public.eventos_asociacion%ROWTYPE;
  v_historial public.historial_evento%ROWTYPE;
  v_campos jsonb := jsonb_build_array(
    'imagen_storage_path',
    'imagen_mime_type',
    'imagen_size_bytes',
    'imagen_texto_alternativo'
  );
  v_usuario_guardado record;
BEGIN
  IF p_evento_id IS NULL OR p_asociacion_id IS NULL
     OR p_actor_usuario_id IS NULL
     OR NULLIF(trim(p_storage_path), '') IS NULL
     OR p_mime_type IS NULL
     OR p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp')
     OR p_size_bytes IS NULL OR p_size_bytes < 1
     OR p_size_bytes > 10485760
     OR length(trim(COALESCE(p_texto_alternativo, ''))) NOT BETWEEN 1 AND 500
     OR length(trim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'registro_imagen_evento_incompleto'
      USING ERRCODE = '22023';
  END IF;

  IF p_storage_path NOT LIKE (
       'eventos/' || p_evento_id::text || '/%'
     ) OR p_storage_path ~ '(^|/)\.\.(/|$)' THEN
    RAISE EXCEPTION 'storage_path_imagen_evento_invalido'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_asociacion_operativa(
    p_actor_usuario_id, p_asociacion_id
  );

  SELECT * INTO v_evento
  FROM public.eventos_asociacion
  WHERE id = p_evento_id
    AND asociacion_id = p_asociacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'evento_no_encontrado_asociacion'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_historial
  FROM public.historial_evento
  WHERE asociacion_id = p_asociacion_id
    AND idempotency_key =
      'evento:imagen:registrar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_historial.evento_id IS DISTINCT FROM p_evento_id
       OR v_historial.datos_extra->>'storage_path'
          IS DISTINCT FROM trim(p_storage_path)
       OR v_historial.datos_extra->>'mime_type'
          IS DISTINCT FROM p_mime_type
       OR (v_historial.datos_extra->>'size_bytes')::bigint
          IS DISTINCT FROM p_size_bytes
       OR v_historial.datos_extra->>'texto_alternativo'
          IS DISTINCT FROM trim(p_texto_alternativo) THEN
      RAISE EXCEPTION 'idempotency_key_imagen_evento_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
      'id', p_evento_id,
      'estado', v_historial.estado_nuevo,
      'version_publica', v_historial.version_publica,
      'updated_at', v_historial.creado_at,
      'event_id', v_historial.id,
      'storage_path', v_historial.datos_extra->>'storage_path',
      'previous_storage_path',
        v_historial.datos_extra->>'previous_storage_path',
      'mime_type', v_historial.datos_extra->>'mime_type',
      'size_bytes', (v_historial.datos_extra->>'size_bytes')::bigint,
      'texto_alternativo',
        v_historial.datos_extra->>'texto_alternativo',
      'reintento', true
    );
  END IF;

  IF v_evento.estado NOT IN ('borrador', 'publicado', 'pausado') THEN
    RAISE EXCEPTION 'evento_no_editable' USING ERRCODE = 'P0001';
  END IF;

  v_anterior := v_evento;

  UPDATE public.eventos_asociacion
  SET imagen_storage_path = trim(p_storage_path),
      imagen_mime_type = p_mime_type,
      imagen_size_bytes = p_size_bytes,
      imagen_texto_alternativo = trim(p_texto_alternativo),
      version_publica = CASE
        WHEN version_publica > 0 THEN version_publica + 1
        ELSE version_publica
      END
  WHERE id = p_evento_id
  RETURNING * INTO v_evento;

  IF v_evento.version_publica > v_anterior.version_publica THEN
    INSERT INTO public.versiones_evento_asociacion (
      evento_id,
      version,
      snapshot_publico,
      campos_modificados,
      creada_por_usuario_id
    ) VALUES (
      v_evento.id,
      v_evento.version_publica,
      public.snapshot_publico_evento_asociacion(v_evento.id),
      v_campos,
      p_actor_usuario_id
    );
  END IF;

  INSERT INTO public.historial_evento (
    evento_id,
    asociacion_id,
    actor_usuario_id,
    tipo_evento,
    estado_anterior,
    estado_nuevo,
    campos_modificados,
    datos_extra,
    version_publica,
    idempotency_key
  ) VALUES (
    v_evento.id,
    p_asociacion_id,
    p_actor_usuario_id,
    'evento_imagen_actualizada',
    v_anterior.estado,
    v_evento.estado,
    v_campos,
    jsonb_build_object(
      'storage_path', v_evento.imagen_storage_path,
      'previous_storage_path', v_anterior.imagen_storage_path,
      'mime_type', v_evento.imagen_mime_type,
      'size_bytes', v_evento.imagen_size_bytes,
      'texto_alternativo', v_evento.imagen_texto_alternativo
    ),
    v_evento.version_publica,
    'evento:imagen:registrar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key)
  ) RETURNING * INTO v_historial;

  IF v_evento.version_publica > 0 THEN
    FOR v_usuario_guardado IN
      SELECT usuario_id
      FROM public.eventos_guardados
      WHERE evento_id = v_evento.id
    LOOP
      BEGIN
        PERFORM public.encolar_notificacion_modulo(
          v_usuario_guardado.usuario_id,
          'evento_actualizado',
          'evento:imagen:actualizada:' || v_historial.id::text,
          jsonb_build_object(
            'evento_id', v_evento.id,
            'estado', v_evento.estado,
            'version_publica', v_evento.version_publica,
            'campos_modificados', v_campos
          ),
          NULL,
          NULL,
          v_evento.id
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'No se pudo encolar cambio de imagen: %', SQLERRM;
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'id', v_evento.id,
    'estado', v_evento.estado,
    'version_publica', v_evento.version_publica,
    'updated_at', v_evento.actualizada_at,
    'event_id', v_historial.id,
    'storage_path', v_evento.imagen_storage_path,
    'previous_storage_path', v_anterior.imagen_storage_path,
    'mime_type', v_evento.imagen_mime_type,
    'size_bytes', v_evento.imagen_size_bytes,
    'texto_alternativo', v_evento.imagen_texto_alternativo,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.retirar_imagen_evento_asociacion(
  p_evento_id uuid,
  p_asociacion_id uuid,
  p_actor_usuario_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_anterior public.eventos_asociacion%ROWTYPE;
  v_evento public.eventos_asociacion%ROWTYPE;
  v_historial public.historial_evento%ROWTYPE;
  v_campos jsonb := jsonb_build_array(
    'imagen_storage_path',
    'imagen_mime_type',
    'imagen_size_bytes',
    'imagen_texto_alternativo'
  );
  v_usuario_guardado record;
BEGIN
  IF p_evento_id IS NULL OR p_asociacion_id IS NULL
     OR p_actor_usuario_id IS NULL
     OR length(trim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'retiro_imagen_evento_incompleto'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_asociacion_operativa(
    p_actor_usuario_id, p_asociacion_id
  );

  SELECT * INTO v_evento
  FROM public.eventos_asociacion
  WHERE id = p_evento_id
    AND asociacion_id = p_asociacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'evento_no_encontrado_asociacion'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_historial
  FROM public.historial_evento
  WHERE asociacion_id = p_asociacion_id
    AND idempotency_key =
      'evento:imagen:retirar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_historial.evento_id IS DISTINCT FROM p_evento_id THEN
      RAISE EXCEPTION 'idempotency_key_retiro_imagen_evento_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
      'id', p_evento_id,
      'estado', v_historial.estado_nuevo,
      'version_publica', v_historial.version_publica,
      'updated_at', v_historial.creado_at,
      'event_id', v_historial.id,
      'previous_storage_path',
        v_historial.datos_extra->>'previous_storage_path',
      'reintento', true
    );
  END IF;

  IF v_evento.estado NOT IN ('borrador', 'publicado', 'pausado') THEN
    RAISE EXCEPTION 'evento_no_editable' USING ERRCODE = 'P0001';
  END IF;

  IF v_evento.imagen_storage_path IS NULL THEN
    RAISE EXCEPTION 'evento_imagen_no_encontrada' USING ERRCODE = 'P0002';
  END IF;

  v_anterior := v_evento;

  UPDATE public.eventos_asociacion
  SET imagen_storage_path = NULL,
      imagen_mime_type = NULL,
      imagen_size_bytes = NULL,
      imagen_texto_alternativo = NULL,
      version_publica = CASE
        WHEN version_publica > 0 THEN version_publica + 1
        ELSE version_publica
      END
  WHERE id = p_evento_id
  RETURNING * INTO v_evento;

  IF v_evento.version_publica > v_anterior.version_publica THEN
    INSERT INTO public.versiones_evento_asociacion (
      evento_id,
      version,
      snapshot_publico,
      campos_modificados,
      creada_por_usuario_id
    ) VALUES (
      v_evento.id,
      v_evento.version_publica,
      public.snapshot_publico_evento_asociacion(v_evento.id),
      v_campos,
      p_actor_usuario_id
    );
  END IF;

  INSERT INTO public.historial_evento (
    evento_id,
    asociacion_id,
    actor_usuario_id,
    tipo_evento,
    estado_anterior,
    estado_nuevo,
    campos_modificados,
    datos_extra,
    version_publica,
    idempotency_key
  ) VALUES (
    v_evento.id,
    p_asociacion_id,
    p_actor_usuario_id,
    'evento_imagen_retirada',
    v_anterior.estado,
    v_evento.estado,
    v_campos,
    jsonb_build_object(
      'previous_storage_path', v_anterior.imagen_storage_path,
      'previous_mime_type', v_anterior.imagen_mime_type,
      'previous_size_bytes', v_anterior.imagen_size_bytes,
      'previous_texto_alternativo',
        v_anterior.imagen_texto_alternativo
    ),
    v_evento.version_publica,
    'evento:imagen:retirar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key)
  ) RETURNING * INTO v_historial;

  IF v_evento.version_publica > 0 THEN
    FOR v_usuario_guardado IN
      SELECT usuario_id
      FROM public.eventos_guardados
      WHERE evento_id = v_evento.id
    LOOP
      BEGIN
        PERFORM public.encolar_notificacion_modulo(
          v_usuario_guardado.usuario_id,
          'evento_actualizado',
          'evento:imagen:retirada:' || v_historial.id::text,
          jsonb_build_object(
            'evento_id', v_evento.id,
            'estado', v_evento.estado,
            'version_publica', v_evento.version_publica,
            'campos_modificados', v_campos
          ),
          NULL,
          NULL,
          v_evento.id
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'No se pudo encolar retiro de imagen: %', SQLERRM;
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'id', v_evento.id,
    'estado', v_evento.estado,
    'version_publica', v_evento.version_publica,
    'updated_at', v_evento.actualizada_at,
    'event_id', v_historial.id,
    'previous_storage_path', v_anterior.imagen_storage_path,
    'reintento', false
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.registrar_imagen_evento_asociacion(
    uuid, uuid, uuid, text, text, bigint, text, text
  ),
  public.retirar_imagen_evento_asociacion(uuid, uuid, uuid, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.registrar_imagen_evento_asociacion(
    uuid, uuid, uuid, text, text, bigint, text, text
  ),
  public.retirar_imagen_evento_asociacion(uuid, uuid, uuid, text)
TO service_role;

COMMENT ON FUNCTION public.registrar_imagen_evento_asociacion(
  uuid, uuid, uuid, text, text, bigint, text, text
) IS
  'Registra o reemplaza la imagen privada de un evento y versiona el cambio publico.';

COMMENT ON FUNCTION public.retirar_imagen_evento_asociacion(
  uuid, uuid, uuid, text
) IS
  'Retira la referencia de imagen sin exponer su storage path al cliente.';

COMMIT;

NOTIFY pgrst, 'reload schema';
