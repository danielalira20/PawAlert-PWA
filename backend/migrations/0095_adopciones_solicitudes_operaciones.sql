-- Operaciones atomicas para el ciclo del solicitante de adopcion.
-- Cada borrador conserva un snapshot de los requisitos publicados y ninguna
-- operacion de este archivo selecciona adoptantes, cierra custodias o reportes.

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_actor_solicitante_adopcion(
  p_actor_usuario_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_auth_user_id uuid;
  v_contacto_confirmado boolean;
BEGIN
  IF p_actor_usuario_id IS NULL THEN
    RAISE EXCEPTION 'actor_requerido' USING ERRCODE = '22023';
  END IF;

  SELECT auth_user_id
  INTO v_auth_user_id
  FROM public.usuarios
  WHERE id = p_actor_usuario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'actor_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'solicitante_requiere_cuenta'
      USING ERRCODE = '42501';
  END IF;

  SELECT email_confirmed_at IS NOT NULL OR phone_confirmed_at IS NOT NULL
  INTO v_contacto_confirmado
  FROM auth.users
  WHERE id = v_auth_user_id;

  IF NOT FOUND OR COALESCE(v_contacto_confirmado, false) = false THEN
    RAISE EXCEPTION 'solicitante_requiere_contacto_verificado'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.snapshot_requisitos_perfil_adopcion(
  p_perfil_adopcion_id uuid
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  WITH perfil AS (
    SELECT
      id,
      asociacion_id,
      requisitos_base_version,
      plantilla_requisitos_id,
      plantilla_version
    FROM public.perfiles_adopcion
    WHERE id = p_perfil_adopcion_id
  ), requisitos AS (
    SELECT
      0 AS origen_orden,
      requisito.orden,
      requisito.clave,
      jsonb_build_object(
        'origen', 'pawalert',
        'referencia_id', requisito.id,
        'clave', requisito.clave,
        'titulo', requisito.titulo,
        'descripcion', requisito.descripcion,
        'tipo_respuesta', requisito.tipo_respuesta,
        'opciones', requisito.opciones,
        'obligatorio', requisito.obligatorio,
        'es_sensible', requisito.es_sensible,
        'orden', requisito.orden
      ) AS requisito_snapshot
    FROM perfil
    JOIN public.requisitos_base_adopcion requisito
      ON requisito.version = perfil.requisitos_base_version
     AND requisito.activo = true

    UNION ALL

    SELECT
      1 AS origen_orden,
      pregunta.orden,
      pregunta.clave,
      jsonb_build_object(
        'origen', 'asociacion',
        'referencia_id', pregunta.id,
        'clave', pregunta.clave,
        'titulo', pregunta.titulo,
        'descripcion', pregunta.descripcion,
        'tipo_respuesta', pregunta.tipo_respuesta,
        'opciones', pregunta.opciones,
        'obligatorio', pregunta.obligatorio,
        'es_sensible', pregunta.es_sensible,
        'orden', pregunta.orden
      ) AS requisito_snapshot
    FROM perfil
    JOIN public.plantillas_requisitos_adopcion plantilla
      ON plantilla.id = perfil.plantilla_requisitos_id
     AND plantilla.asociacion_id = perfil.asociacion_id
     AND plantilla.version = perfil.plantilla_version
    JOIN public.preguntas_requisito_adopcion pregunta
      ON pregunta.plantilla_id = plantilla.id
  )
  SELECT COALESCE(
    jsonb_agg(
      requisito_snapshot
      ORDER BY origen_orden, orden, clave
    ),
    '[]'::jsonb
  )
  FROM requisitos;
$$;

CREATE OR REPLACE FUNCTION public.respuesta_adopcion_valida(
  p_pregunta jsonb,
  p_respuesta jsonb
) RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tipo text;
  v_valor jsonb;
  v_opciones jsonb;
  v_documento jsonb;
  v_fecha date;
BEGIN
  IF p_pregunta IS NULL OR jsonb_typeof(p_pregunta) <> 'object'
     OR p_respuesta IS NULL OR jsonb_typeof(p_respuesta) <> 'object' THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_respuesta) AS campo
    WHERE campo <> ALL (ARRAY['clave', 'valor', 'documento', 'eliminar'])
  ) THEN
    RETURN false;
  END IF;

  IF p_respuesta->>'clave' IS DISTINCT FROM p_pregunta->>'clave' THEN
    RETURN false;
  END IF;

  IF p_respuesta ? 'eliminar' THEN
    RETURN p_respuesta->'eliminar' = 'true'::jsonb
      AND NOT p_respuesta ? 'valor'
      AND NOT p_respuesta ? 'documento';
  END IF;

  v_tipo := p_pregunta->>'tipo_respuesta';
  v_opciones := COALESCE(p_pregunta->'opciones', '[]'::jsonb);

  IF v_tipo = 'documento' THEN
    IF p_respuesta ? 'valor' OR NOT p_respuesta ? 'documento' THEN
      RETURN false;
    END IF;

    v_documento := p_respuesta->'documento';
    IF jsonb_typeof(v_documento) <> 'object'
       OR EXISTS (
         SELECT 1
         FROM jsonb_object_keys(v_documento) AS campo
         WHERE campo <> ALL (ARRAY['storage_path', 'mime_type', 'size_bytes'])
       )
       OR NULLIF(trim(v_documento->>'storage_path'), '') IS NULL
       OR v_documento->>'storage_path' !~ '^adopciones/solicitudes/'
       OR v_documento->>'storage_path' ~ '(^|/)\.\.(/|$)'
       OR v_documento->>'mime_type' NOT IN (
         'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
       )
       OR COALESCE(v_documento->>'size_bytes', '') !~ '^[0-9]+$'
       OR (v_documento->>'size_bytes')::bigint NOT BETWEEN 1 AND 10485760
       OR p_pregunta->'es_sensible' <> 'true'::jsonb THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  IF p_respuesta ? 'documento' OR NOT p_respuesta ? 'valor' THEN
    RETURN false;
  END IF;
  v_valor := p_respuesta->'valor';

  IF v_tipo = 'texto_corto' THEN
    RETURN jsonb_typeof(v_valor) = 'string'
      AND length(trim(v_valor #>> '{}')) BETWEEN 1 AND 500;
  ELSIF v_tipo = 'texto_largo' THEN
    RETURN jsonb_typeof(v_valor) = 'string'
      AND length(trim(v_valor #>> '{}')) BETWEEN 1 AND 4000;
  ELSIF v_tipo = 'booleano' THEN
    RETURN jsonb_typeof(v_valor) = 'boolean';
  ELSIF v_tipo = 'seleccion_unica' THEN
    RETURN jsonb_typeof(v_valor) = 'string'
      AND (v_opciones ? (v_valor #>> '{}'));
  ELSIF v_tipo = 'seleccion_multiple' THEN
    RETURN jsonb_typeof(v_valor) = 'array'
      AND jsonb_array_length(v_valor) BETWEEN 1 AND 20
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_valor) AS opcion
        WHERE jsonb_typeof(opcion) <> 'string'
           OR NOT (v_opciones ? (opcion #>> '{}'))
      )
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(v_valor) AS opcion(valor)
        GROUP BY valor
        HAVING count(*) > 1
      );
  ELSIF v_tipo = 'fecha' THEN
    IF jsonb_typeof(v_valor) <> 'string'
       OR (v_valor #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RETURN false;
    END IF;
    BEGIN
      v_fecha := (v_valor #>> '{}')::date;
      RETURN to_char(v_fecha, 'YYYY-MM-DD') = (v_valor #>> '{}');
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.crear_borrador_solicitud_adopcion(
  p_perfil_adopcion_id uuid,
  p_actor_usuario_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_perfil public.perfiles_adopcion%ROWTYPE;
  v_solicitud public.solicitudes_adopcion%ROWTYPE;
  v_evento public.historial_adopcion%ROWTYPE;
  v_snapshot jsonb;
  v_asociacion_operativa boolean;
BEGIN
  IF p_perfil_adopcion_id IS NULL OR p_actor_usuario_id IS NULL
     OR NULLIF(trim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'borrador_solicitud_adopcion_incompleto'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_solicitante_adopcion(p_actor_usuario_id);
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_actor_usuario_id::text || ':' || p_perfil_adopcion_id::text,
      0
    )
  );

  SELECT *
  INTO v_solicitud
  FROM public.solicitudes_adopcion
  WHERE solicitante_usuario_id = p_actor_usuario_id
    AND idempotency_key = trim(p_idempotency_key);

  IF FOUND THEN
    IF v_solicitud.perfil_adopcion_id IS DISTINCT FROM p_perfil_adopcion_id THEN
      RAISE EXCEPTION 'idempotency_key_borrador_adopcion_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT *
    INTO v_evento
    FROM public.historial_adopcion
    WHERE asociacion_id = v_solicitud.asociacion_id
      AND idempotency_key =
        'solicitud:borrador:' || p_actor_usuario_id::text || ':'
        || trim(p_idempotency_key);

    RETURN jsonb_build_object(
      'id', v_solicitud.id,
      'estado', v_solicitud.estado,
      'updated_at', v_solicitud.actualizada_at,
      'event_id', v_evento.id,
      'reintento', true
    );
  END IF;

  SELECT perfil.*
  INTO v_perfil
  FROM public.perfiles_adopcion perfil
  WHERE perfil.id = p_perfil_adopcion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'adopcion_publica_no_encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(asociacion.activo, false)
    AND COALESCE(asociacion.verificado, false)
  INTO v_asociacion_operativa
  FROM public.asociaciones asociacion
  WHERE asociacion.id = v_perfil.asociacion_id;

  IF v_perfil.estado <> 'publicado'
     OR v_perfil.estado_moderacion <> 'visible'
     OR COALESCE(v_asociacion_operativa, false) = false THEN
    RAISE EXCEPTION 'adopcion_publica_no_disponible'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_solicitud
  FROM public.solicitudes_adopcion
  WHERE perfil_adopcion_id = p_perfil_adopcion_id
    AND solicitante_usuario_id = p_actor_usuario_id
    AND estado NOT IN (
      'rechazada', 'retirada', 'vencida',
      'cerrada_por_adopcion', 'adopcion_confirmada'
    )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'solicitud_adopcion_abierta_duplicada'
      USING ERRCODE = 'P0001';
  END IF;

  v_snapshot := public.snapshot_requisitos_perfil_adopcion(
    p_perfil_adopcion_id
  );
  IF jsonb_array_length(v_snapshot) = 0 THEN
    RAISE EXCEPTION 'requisitos_base_adopcion_no_disponibles'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.solicitudes_adopcion (
    perfil_adopcion_id,
    asociacion_id,
    solicitante_usuario_id,
    plantilla_requisitos_id,
    plantilla_version,
    requisitos_base_version,
    requisitos_snapshot,
    estado,
    idempotency_key
  ) VALUES (
    v_perfil.id,
    v_perfil.asociacion_id,
    p_actor_usuario_id,
    v_perfil.plantilla_requisitos_id,
    v_perfil.plantilla_version,
    v_perfil.requisitos_base_version,
    v_snapshot,
    'borrador',
    trim(p_idempotency_key)
  ) RETURNING * INTO v_solicitud;

  INSERT INTO public.historial_adopcion (
    asociacion_id,
    perfil_adopcion_id,
    solicitud_adopcion_id,
    actor_usuario_id,
    tipo_evento,
    estado_nuevo,
    datos_extra,
    idempotency_key
  ) VALUES (
    v_solicitud.asociacion_id,
    v_solicitud.perfil_adopcion_id,
    v_solicitud.id,
    p_actor_usuario_id,
    'solicitud_adopcion_borrador_creado',
    'borrador',
    jsonb_build_object(
      'requisitos_base_version', v_solicitud.requisitos_base_version,
      'plantilla_requisitos_id', v_solicitud.plantilla_requisitos_id,
      'plantilla_version', v_solicitud.plantilla_version,
      'cantidad_requisitos', jsonb_array_length(v_snapshot)
    ),
    'solicitud:borrador:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key)
  ) RETURNING * INTO v_evento;

  RETURN jsonb_build_object(
    'id', v_solicitud.id,
    'estado', v_solicitud.estado,
    'updated_at', v_solicitud.actualizada_at,
    'event_id', v_evento.id,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.actualizar_respuestas_solicitud_adopcion(
  p_solicitud_adopcion_id uuid,
  p_actor_usuario_id uuid,
  p_respuestas jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_solicitud public.solicitudes_adopcion%ROWTYPE;
  v_evento public.historial_adopcion%ROWTYPE;
  v_item jsonb;
  v_pregunta jsonb;
  v_documento jsonb;
  v_payload_hash text;
  v_cambios integer := 0;
BEGIN
  IF p_solicitud_adopcion_id IS NULL OR p_actor_usuario_id IS NULL
     OR NULLIF(trim(p_idempotency_key), '') IS NULL
     OR p_respuestas IS NULL
     OR jsonb_typeof(p_respuestas) <> 'array'
     OR jsonb_array_length(p_respuestas) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'respuestas_solicitud_adopcion_invalidas'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_respuestas) AS item
    GROUP BY item->>'clave'
    HAVING item->>'clave' IS NULL OR count(*) > 1
  ) THEN
    RAISE EXCEPTION 'respuestas_solicitud_adopcion_invalidas'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_solicitante_adopcion(p_actor_usuario_id);
  v_payload_hash := md5(p_respuestas::text);

  SELECT *
  INTO v_solicitud
  FROM public.solicitudes_adopcion
  WHERE id = p_solicitud_adopcion_id
    AND solicitante_usuario_id = p_actor_usuario_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitud_adopcion_no_encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_evento
  FROM public.historial_adopcion
  WHERE asociacion_id = v_solicitud.asociacion_id
    AND idempotency_key =
      'solicitud:respuestas:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_evento.solicitud_adopcion_id IS DISTINCT FROM v_solicitud.id
       OR v_evento.datos_extra->>'payload_hash'
         IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'idempotency_key_respuestas_adopcion_en_conflicto'
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

  IF v_solicitud.estado NOT IN ('borrador', 'requiere_informacion') THEN
    RAISE EXCEPTION 'solicitud_adopcion_respuestas_no_editables'
      USING ERRCODE = 'P0001';
  END IF;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_respuestas)
  LOOP
    SELECT value
    INTO v_pregunta
    FROM jsonb_array_elements(v_solicitud.requisitos_snapshot)
    WHERE value->>'clave' = v_item->>'clave'
    LIMIT 1;

    IF NOT FOUND OR NOT public.respuesta_adopcion_valida(
      v_pregunta, v_item
    ) THEN
      RAISE EXCEPTION 'respuesta_solicitud_adopcion_invalida:%',
        COALESCE(v_item->>'clave', 'sin_clave')
        USING ERRCODE = '22023';
    END IF;

    IF v_item->'eliminar' = 'true'::jsonb THEN
      DELETE FROM public.respuestas_solicitud_adopcion
      WHERE solicitud_adopcion_id = v_solicitud.id
        AND pregunta_clave_snapshot = v_item->>'clave';
      v_cambios := v_cambios + 1;
      CONTINUE;
    END IF;

    v_documento := v_item->'documento';
    IF v_pregunta->>'tipo_respuesta' = 'documento'
       AND v_documento->>'storage_path' NOT LIKE
         'adopciones/solicitudes/' || v_solicitud.id::text || '/%' THEN
      RAISE EXCEPTION 'documento_solicitud_adopcion_fuera_de_contexto'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.respuestas_solicitud_adopcion (
      solicitud_adopcion_id,
      requisito_base_id,
      pregunta_personalizada_id,
      pregunta_clave_snapshot,
      pregunta_texto_snapshot,
      tipo_respuesta_snapshot,
      obligatoria_snapshot,
      es_sensible_snapshot,
      respuesta_json,
      documento_storage_path,
      documento_mime_type,
      documento_size_bytes
    ) VALUES (
      v_solicitud.id,
      CASE WHEN v_pregunta->>'origen' = 'pawalert'
        THEN (v_pregunta->>'referencia_id')::uuid END,
      CASE WHEN v_pregunta->>'origen' = 'asociacion'
        THEN (v_pregunta->>'referencia_id')::uuid END,
      v_pregunta->>'clave',
      v_pregunta->>'titulo',
      v_pregunta->>'tipo_respuesta',
      (v_pregunta->>'obligatorio')::boolean,
      (v_pregunta->>'es_sensible')::boolean,
      CASE WHEN v_pregunta->>'tipo_respuesta' <> 'documento'
        THEN v_item->'valor' END,
      CASE WHEN v_pregunta->>'tipo_respuesta' = 'documento'
        THEN v_documento->>'storage_path' END,
      CASE WHEN v_pregunta->>'tipo_respuesta' = 'documento'
        THEN v_documento->>'mime_type' END,
      CASE WHEN v_pregunta->>'tipo_respuesta' = 'documento'
        THEN (v_documento->>'size_bytes')::bigint END
    )
    ON CONFLICT (solicitud_adopcion_id, pregunta_clave_snapshot)
    DO UPDATE SET
      respuesta_json = EXCLUDED.respuesta_json,
      documento_storage_path = EXCLUDED.documento_storage_path,
      documento_mime_type = EXCLUDED.documento_mime_type,
      documento_size_bytes = EXCLUDED.documento_size_bytes;
    v_cambios := v_cambios + 1;
  END LOOP;

  UPDATE public.solicitudes_adopcion
  SET actualizada_at = now()
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
    v_solicitud.asociacion_id,
    v_solicitud.perfil_adopcion_id,
    v_solicitud.id,
    p_actor_usuario_id,
    'solicitud_adopcion_respuestas_actualizadas',
    v_solicitud.estado,
    v_solicitud.estado,
    jsonb_build_object(
      'cantidad_cambios', v_cambios,
      'payload_hash', v_payload_hash
    ),
    'solicitud:respuestas:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key)
  ) RETURNING * INTO v_evento;

  RETURN jsonb_build_object(
    'id', v_solicitud.id,
    'estado', v_solicitud.estado,
    'updated_at', v_solicitud.actualizada_at,
    'event_id', v_evento.id,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enviar_solicitud_adopcion(
  p_solicitud_adopcion_id uuid,
  p_actor_usuario_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_solicitud public.solicitudes_adopcion%ROWTYPE;
  v_perfil public.perfiles_adopcion%ROWTYPE;
  v_evento public.historial_adopcion%ROWTYPE;
  v_estado_anterior text;
  v_estado_nuevo text;
  v_asociacion_operativa boolean;
BEGIN
  IF p_solicitud_adopcion_id IS NULL OR p_actor_usuario_id IS NULL
     OR NULLIF(trim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'envio_solicitud_adopcion_incompleto'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_solicitante_adopcion(p_actor_usuario_id);

  SELECT *
  INTO v_solicitud
  FROM public.solicitudes_adopcion
  WHERE id = p_solicitud_adopcion_id
    AND solicitante_usuario_id = p_actor_usuario_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitud_adopcion_no_encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_evento
  FROM public.historial_adopcion
  WHERE asociacion_id = v_solicitud.asociacion_id
    AND idempotency_key =
      'solicitud:enviar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_evento.solicitud_adopcion_id IS DISTINCT FROM v_solicitud.id THEN
      RAISE EXCEPTION 'idempotency_key_envio_adopcion_en_conflicto'
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

  IF v_solicitud.estado NOT IN ('borrador', 'requiere_informacion') THEN
    RAISE EXCEPTION 'solicitud_adopcion_no_enviable'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_perfil
  FROM public.perfiles_adopcion
  WHERE id = v_solicitud.perfil_adopcion_id
  FOR UPDATE;

  SELECT COALESCE(asociacion.activo, false)
    AND COALESCE(asociacion.verificado, false)
  INTO v_asociacion_operativa
  FROM public.asociaciones asociacion
  WHERE asociacion.id = v_solicitud.asociacion_id;

  IF v_perfil.estado <> 'publicado'
     OR v_perfil.estado_moderacion <> 'visible'
     OR COALESCE(v_asociacion_operativa, false) = false THEN
    RAISE EXCEPTION 'adopcion_publica_no_disponible'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_solicitud.requisitos_snapshot) AS requisito
    WHERE (requisito->>'obligatorio')::boolean = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.respuestas_solicitud_adopcion respuesta
        WHERE respuesta.solicitud_adopcion_id = v_solicitud.id
          AND respuesta.pregunta_clave_snapshot = requisito->>'clave'
      )
  ) THEN
    RAISE EXCEPTION 'solicitud_adopcion_requisitos_obligatorios_incompletos'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_solicitud.requisitos_snapshot) AS requisito
    WHERE requisito->>'origen' = 'pawalert'
      AND requisito->>'clave' IN (
        'consentimiento_integrantes',
        'compromiso_veterinario',
        'seguimiento_devolucion_responsable',
        'veracidad_privacidad'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.respuestas_solicitud_adopcion respuesta
        WHERE respuesta.solicitud_adopcion_id = v_solicitud.id
          AND respuesta.pregunta_clave_snapshot = requisito->>'clave'
          AND respuesta.respuesta_json = 'true'::jsonb
      )
  ) THEN
    RAISE EXCEPTION 'solicitud_adopcion_consentimientos_requeridos'
      USING ERRCODE = '22023';
  END IF;

  v_estado_anterior := v_solicitud.estado;
  v_estado_nuevo := CASE
    WHEN v_estado_anterior = 'borrador' THEN 'enviada'
    ELSE 'en_evaluacion'
  END;

  UPDATE public.solicitudes_adopcion
  SET estado = v_estado_nuevo,
      enviada_at = COALESCE(enviada_at, now()),
      vencimiento_at = COALESCE(vencimiento_at, now() + interval '30 days')
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
    idempotency_key
  ) VALUES (
    v_solicitud.asociacion_id,
    v_solicitud.perfil_adopcion_id,
    v_solicitud.id,
    p_actor_usuario_id,
    CASE WHEN v_estado_anterior = 'borrador'
      THEN 'solicitud_adopcion_enviada'
      ELSE 'solicitud_adopcion_informacion_completada' END,
    v_estado_anterior,
    v_estado_nuevo,
    'solicitud:enviar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key)
  ) RETURNING * INTO v_evento;

  RETURN jsonb_build_object(
    'id', v_solicitud.id,
    'estado', v_solicitud.estado,
    'updated_at', v_solicitud.actualizada_at,
    'event_id', v_evento.id,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.retirar_solicitud_adopcion(
  p_solicitud_adopcion_id uuid,
  p_actor_usuario_id uuid,
  p_motivo text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_solicitud public.solicitudes_adopcion%ROWTYPE;
  v_evento public.historial_adopcion%ROWTYPE;
  v_estado_anterior text;
  v_payload_hash text;
BEGIN
  IF p_solicitud_adopcion_id IS NULL OR p_actor_usuario_id IS NULL
     OR length(trim(COALESCE(p_motivo, ''))) NOT BETWEEN 1 AND 1000
     OR NULLIF(trim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'retiro_solicitud_adopcion_incompleto'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_solicitante_adopcion(p_actor_usuario_id);
  v_payload_hash := md5(trim(p_motivo));

  SELECT *
  INTO v_solicitud
  FROM public.solicitudes_adopcion
  WHERE id = p_solicitud_adopcion_id
    AND solicitante_usuario_id = p_actor_usuario_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitud_adopcion_no_encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_evento
  FROM public.historial_adopcion
  WHERE asociacion_id = v_solicitud.asociacion_id
    AND idempotency_key =
      'solicitud:retirar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_evento.solicitud_adopcion_id IS DISTINCT FROM v_solicitud.id
       OR v_evento.datos_extra->>'payload_hash'
         IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'idempotency_key_retiro_adopcion_en_conflicto'
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
    'enviada', 'requiere_informacion',
    'en_evaluacion', 'entrevista_programada'
  ) THEN
    RAISE EXCEPTION 'solicitud_adopcion_no_retirable'
      USING ERRCODE = 'P0001';
  END IF;

  v_estado_anterior := v_solicitud.estado;
  UPDATE public.solicitudes_adopcion
  SET estado = 'retirada',
      retirada_at = now()
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
    v_solicitud.asociacion_id,
    v_solicitud.perfil_adopcion_id,
    v_solicitud.id,
    p_actor_usuario_id,
    'solicitud_adopcion_retirada',
    v_estado_anterior,
    'retirada',
    trim(p_motivo),
    jsonb_build_object('payload_hash', v_payload_hash),
    'solicitud:retirar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key)
  ) RETURNING * INTO v_evento;

  RETURN jsonb_build_object(
    'id', v_solicitud.id,
    'estado', v_solicitud.estado,
    'updated_at', v_solicitud.actualizada_at,
    'event_id', v_evento.id,
    'reintento', false
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.validar_actor_solicitante_adopcion(uuid),
  public.snapshot_requisitos_perfil_adopcion(uuid),
  public.respuesta_adopcion_valida(jsonb, jsonb),
  public.crear_borrador_solicitud_adopcion(uuid, uuid, text),
  public.actualizar_respuestas_solicitud_adopcion(uuid, uuid, jsonb, text),
  public.enviar_solicitud_adopcion(uuid, uuid, text),
  public.retirar_solicitud_adopcion(uuid, uuid, text, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.validar_actor_solicitante_adopcion(uuid),
  public.snapshot_requisitos_perfil_adopcion(uuid),
  public.respuesta_adopcion_valida(jsonb, jsonb),
  public.crear_borrador_solicitud_adopcion(uuid, uuid, text),
  public.actualizar_respuestas_solicitud_adopcion(uuid, uuid, jsonb, text),
  public.enviar_solicitud_adopcion(uuid, uuid, text),
  public.retirar_solicitud_adopcion(uuid, uuid, text, text)
TO service_role;

COMMENT ON FUNCTION public.crear_borrador_solicitud_adopcion(uuid, uuid, text)
IS 'Crea un borrador privado y congela los requisitos vigentes del perfil.';

COMMENT ON FUNCTION public.actualizar_respuestas_solicitud_adopcion(
  uuid, uuid, jsonb, text
) IS 'Guarda respuestas tipadas del solicitante sin exponer su contenido en historial.';

COMMENT ON FUNCTION public.enviar_solicitud_adopcion(uuid, uuid, text)
IS 'Envia una solicitud completa sin seleccionar adoptante ni cambiar el perfil.';

COMMENT ON FUNCTION public.retirar_solicitud_adopcion(uuid, uuid, text, text)
IS 'Permite al solicitante retirar un expediente no seleccionado.';

COMMIT;

NOTIFY pgrst, 'reload schema';
