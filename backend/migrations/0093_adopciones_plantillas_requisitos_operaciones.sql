-- Operaciones atomicas para administrar requisitos adicionales de adopcion.
-- Las plantillas activas son inmutables: cualquier cambio se prepara en una
-- version borrador y su activacion retira la version anterior.

BEGIN;

ALTER TABLE public.historial_adopcion
  ADD COLUMN IF NOT EXISTS plantilla_requisitos_id uuid
    REFERENCES public.plantillas_requisitos_adopcion(id) ON DELETE RESTRICT;

ALTER TABLE public.historial_adopcion
  DROP CONSTRAINT IF EXISTS historial_adopcion_entidad_requerida;

ALTER TABLE public.historial_adopcion
  ADD CONSTRAINT historial_adopcion_entidad_requerida CHECK (
    solicitud_ingreso_id IS NOT NULL
    OR perfil_adopcion_id IS NOT NULL
    OR solicitud_adopcion_id IS NOT NULL
    OR plantilla_requisitos_id IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS historial_adopcion_plantilla_fecha_idx
  ON public.historial_adopcion(
    plantilla_requisitos_id, creado_at DESC
  )
  WHERE plantilla_requisitos_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.preguntas_plantilla_adopcion_validas(
  p_preguntas jsonb
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_preguntas IS NOT NULL
    AND jsonb_typeof(p_preguntas) = 'array'
    AND CASE
      WHEN jsonb_typeof(p_preguntas) = 'array'
        THEN jsonb_array_length(p_preguntas) <= 25
      ELSE false
    END
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(p_preguntas) = 'array' THEN p_preguntas
          ELSE '[]'::jsonb
        END
      ) AS pregunta
      WHERE jsonb_typeof(pregunta) <> 'object'
        OR EXISTS (
          SELECT 1
          FROM jsonb_object_keys(CASE
            WHEN jsonb_typeof(pregunta) = 'object' THEN pregunta
            ELSE '{}'::jsonb
          END) AS campo
          WHERE campo <> ALL (ARRAY[
            'clave',
            'titulo',
            'descripcion',
            'tipo_respuesta',
            'opciones',
            'obligatorio',
            'es_sensible',
            'orden'
          ])
        )
        OR COALESCE(pregunta->>'clave', '') !~ '^[a-z0-9_]{1,80}$'
        OR length(trim(COALESCE(pregunta->>'titulo', '')))
          NOT BETWEEN 1 AND 300
        OR length(COALESCE(pregunta->>'descripcion', '')) > 1000
        OR COALESCE(pregunta->>'tipo_respuesta', '') NOT IN (
          'texto_corto',
          'texto_largo',
          'seleccion_unica',
          'seleccion_multiple',
          'booleano',
          'fecha',
          'documento'
        )
        OR jsonb_typeof(COALESCE(pregunta->'opciones', '[]'::jsonb)) <> 'array'
        OR (
          pregunta->>'tipo_respuesta' IN (
            'seleccion_unica', 'seleccion_multiple'
          )
          AND jsonb_array_length(CASE
            WHEN jsonb_typeof(
              COALESCE(pregunta->'opciones', '[]'::jsonb)
            ) = 'array'
              THEN COALESCE(pregunta->'opciones', '[]'::jsonb)
            ELSE '[]'::jsonb
          END
          ) NOT BETWEEN 1 AND 20
        )
        OR (
          pregunta->>'tipo_respuesta' NOT IN (
            'seleccion_unica', 'seleccion_multiple'
          )
          AND jsonb_array_length(CASE
            WHEN jsonb_typeof(
              COALESCE(pregunta->'opciones', '[]'::jsonb)
            ) = 'array'
              THEN COALESCE(pregunta->'opciones', '[]'::jsonb)
            ELSE '[]'::jsonb
          END
          ) <> 0
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(
                COALESCE(pregunta->'opciones', '[]'::jsonb)
              ) = 'array'
                THEN COALESCE(pregunta->'opciones', '[]'::jsonb)
              ELSE '[]'::jsonb
            END
          ) AS opcion
          WHERE jsonb_typeof(opcion) <> 'string'
             OR length(trim(opcion #>> '{}')) NOT BETWEEN 1 AND 200
        )
        OR (
          pregunta ? 'obligatorio'
          AND jsonb_typeof(pregunta->'obligatorio') <> 'boolean'
        )
        OR (
          pregunta ? 'es_sensible'
          AND jsonb_typeof(pregunta->'es_sensible') <> 'boolean'
        )
        OR pregunta->>'orden' IS NULL
        OR pregunta->>'orden' !~ '^[0-9]+$'
        OR CASE
          WHEN pregunta->>'orden' ~ '^[0-9]+$'
            THEN (pregunta->>'orden')::numeric NOT BETWEEN 1 AND 32767
          ELSE true
        END
        OR (
          pregunta->>'tipo_respuesta' = 'documento'
          AND COALESCE(pregunta->'es_sensible', 'false'::jsonb)
            <> 'true'::jsonb
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(p_preguntas) = 'array' THEN p_preguntas
          ELSE '[]'::jsonb
        END
      ) AS pregunta
      GROUP BY pregunta->>'clave'
      HAVING count(*) > 1
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(p_preguntas) = 'array' THEN p_preguntas
          ELSE '[]'::jsonb
        END
      ) AS pregunta
      GROUP BY CASE
        WHEN pregunta->>'orden' ~ '^[0-9]+$'
          THEN (pregunta->>'orden')::numeric
        ELSE NULL
      END
      HAVING count(*) > 1
    );
$$;

CREATE OR REPLACE FUNCTION public.insertar_preguntas_plantilla_adopcion(
  p_plantilla_id uuid,
  p_preguntas jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_plantilla_id IS NULL
     OR NOT public.preguntas_plantilla_adopcion_validas(p_preguntas) THEN
    RAISE EXCEPTION 'preguntas_plantilla_adopcion_invalidas'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.preguntas_requisito_adopcion (
    plantilla_id,
    clave,
    titulo,
    descripcion,
    tipo_respuesta,
    opciones,
    obligatorio,
    es_sensible,
    orden
  )
  SELECT
    p_plantilla_id,
    pregunta->>'clave',
    trim(pregunta->>'titulo'),
    NULLIF(trim(pregunta->>'descripcion'), ''),
    pregunta->>'tipo_respuesta',
    COALESCE(pregunta->'opciones', '[]'::jsonb),
    COALESCE((pregunta->>'obligatorio')::boolean, false),
    COALESCE((pregunta->>'es_sensible')::boolean, false),
    (pregunta->>'orden')::smallint
  FROM jsonb_array_elements(p_preguntas) AS pregunta;
END;
$$;

CREATE OR REPLACE FUNCTION public.crear_plantilla_requisitos_adopcion(
  p_asociacion_id uuid,
  p_actor_usuario_id uuid,
  p_nombre text,
  p_descripcion text,
  p_preguntas jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plantilla public.plantillas_requisitos_adopcion%ROWTYPE;
  v_evento public.historial_adopcion%ROWTYPE;
  v_version integer;
  v_payload_hash text;
BEGIN
  IF p_asociacion_id IS NULL OR p_actor_usuario_id IS NULL
     OR length(trim(COALESCE(p_nombre, ''))) NOT BETWEEN 1 AND 160
     OR length(COALESCE(p_descripcion, '')) > 2000
     OR NULLIF(trim(p_idempotency_key), '') IS NULL
     OR NOT public.preguntas_plantilla_adopcion_validas(p_preguntas) THEN
    RAISE EXCEPTION 'plantilla_requisitos_adopcion_invalida'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_asociacion_operativa(
    p_actor_usuario_id, p_asociacion_id
  );

  v_payload_hash := md5(jsonb_build_object(
    'nombre', trim(p_nombre),
    'descripcion', NULLIF(trim(p_descripcion), ''),
    'preguntas', p_preguntas
  )::text);

  PERFORM pg_advisory_xact_lock(hashtextextended(p_asociacion_id::text, 0));

  SELECT * INTO v_evento
  FROM public.historial_adopcion
  WHERE asociacion_id = p_asociacion_id
    AND idempotency_key = 'plantilla:crear:' || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_evento.datos_extra->>'payload_hash' IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'idempotency_key_plantilla_creacion_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_plantilla
    FROM public.plantillas_requisitos_adopcion
    WHERE id = v_evento.plantilla_requisitos_id;

    RETURN jsonb_build_object(
      'id', v_plantilla.id,
      'version', v_plantilla.version,
      'estado', v_plantilla.estado,
      'updated_at', v_plantilla.actualizada_at,
      'event_id', v_evento.id,
      'reintento', true
    );
  END IF;

  SELECT COALESCE(max(version), 0) + 1
  INTO v_version
  FROM public.plantillas_requisitos_adopcion
  WHERE asociacion_id = p_asociacion_id;

  INSERT INTO public.plantillas_requisitos_adopcion (
    asociacion_id,
    version,
    nombre,
    descripcion,
    requisitos_base_version,
    estado,
    creada_por_usuario_id
  ) VALUES (
    p_asociacion_id,
    v_version,
    trim(p_nombre),
    NULLIF(trim(p_descripcion), ''),
    'pawalert-v1',
    'borrador',
    p_actor_usuario_id
  ) RETURNING * INTO v_plantilla;

  PERFORM public.insertar_preguntas_plantilla_adopcion(
    v_plantilla.id, p_preguntas
  );

  INSERT INTO public.historial_adopcion (
    asociacion_id,
    plantilla_requisitos_id,
    actor_usuario_id,
    tipo_evento,
    estado_nuevo,
    datos_extra,
    idempotency_key
  ) VALUES (
    p_asociacion_id,
    v_plantilla.id,
    p_actor_usuario_id,
    'plantilla_requisitos_adopcion_creada',
    'borrador',
    jsonb_build_object(
      'version', v_plantilla.version,
      'payload_hash', v_payload_hash,
      'cantidad_preguntas', jsonb_array_length(p_preguntas)
    ),
    'plantilla:crear:' || trim(p_idempotency_key)
  ) RETURNING * INTO v_evento;

  RETURN jsonb_build_object(
    'id', v_plantilla.id,
    'version', v_plantilla.version,
    'estado', v_plantilla.estado,
    'updated_at', v_plantilla.actualizada_at,
    'event_id', v_evento.id,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.actualizar_plantilla_requisitos_adopcion(
  p_plantilla_id uuid,
  p_asociacion_id uuid,
  p_actor_usuario_id uuid,
  p_nombre text,
  p_descripcion text,
  p_preguntas jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plantilla public.plantillas_requisitos_adopcion%ROWTYPE;
  v_evento public.historial_adopcion%ROWTYPE;
  v_payload_hash text;
BEGIN
  IF p_plantilla_id IS NULL OR p_asociacion_id IS NULL
     OR p_actor_usuario_id IS NULL
     OR length(trim(COALESCE(p_nombre, ''))) NOT BETWEEN 1 AND 160
     OR length(COALESCE(p_descripcion, '')) > 2000
     OR NULLIF(trim(p_idempotency_key), '') IS NULL
     OR NOT public.preguntas_plantilla_adopcion_validas(p_preguntas) THEN
    RAISE EXCEPTION 'plantilla_requisitos_adopcion_invalida'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_asociacion_operativa(
    p_actor_usuario_id, p_asociacion_id
  );

  v_payload_hash := md5(jsonb_build_object(
    'nombre', trim(p_nombre),
    'descripcion', NULLIF(trim(p_descripcion), ''),
    'preguntas', p_preguntas
  )::text);

  SELECT * INTO v_plantilla
  FROM public.plantillas_requisitos_adopcion
  WHERE id = p_plantilla_id
    AND asociacion_id = p_asociacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'plantilla_requisitos_adopcion_no_encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_evento
  FROM public.historial_adopcion
  WHERE asociacion_id = p_asociacion_id
    AND idempotency_key = 'plantilla:actualizar:' || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_evento.plantilla_requisitos_id IS DISTINCT FROM p_plantilla_id
       OR v_evento.datos_extra->>'payload_hash' IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'idempotency_key_plantilla_actualizacion_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
      'id', v_plantilla.id,
      'version', v_plantilla.version,
      'estado', v_plantilla.estado,
      'updated_at', v_plantilla.actualizada_at,
      'event_id', v_evento.id,
      'reintento', true
    );
  END IF;

  IF v_plantilla.estado <> 'borrador' THEN
    RAISE EXCEPTION 'plantilla_requisitos_adopcion_no_editable'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.plantillas_requisitos_adopcion
  SET nombre = trim(p_nombre),
      descripcion = NULLIF(trim(p_descripcion), '')
  WHERE id = p_plantilla_id
  RETURNING * INTO v_plantilla;

  DELETE FROM public.preguntas_requisito_adopcion
  WHERE plantilla_id = p_plantilla_id;

  PERFORM public.insertar_preguntas_plantilla_adopcion(
    p_plantilla_id, p_preguntas
  );

  INSERT INTO public.historial_adopcion (
    asociacion_id,
    plantilla_requisitos_id,
    actor_usuario_id,
    tipo_evento,
    estado_anterior,
    estado_nuevo,
    datos_extra,
    idempotency_key
  ) VALUES (
    p_asociacion_id,
    p_plantilla_id,
    p_actor_usuario_id,
    'plantilla_requisitos_adopcion_actualizada',
    'borrador',
    'borrador',
    jsonb_build_object(
      'version', v_plantilla.version,
      'payload_hash', v_payload_hash,
      'cantidad_preguntas', jsonb_array_length(p_preguntas)
    ),
    'plantilla:actualizar:' || trim(p_idempotency_key)
  ) RETURNING * INTO v_evento;

  RETURN jsonb_build_object(
    'id', v_plantilla.id,
    'version', v_plantilla.version,
    'estado', v_plantilla.estado,
    'updated_at', v_plantilla.actualizada_at,
    'event_id', v_evento.id,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.activar_plantilla_requisitos_adopcion(
  p_plantilla_id uuid,
  p_asociacion_id uuid,
  p_actor_usuario_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plantilla public.plantillas_requisitos_adopcion%ROWTYPE;
  v_evento public.historial_adopcion%ROWTYPE;
  v_retiradas integer := 0;
BEGIN
  IF p_plantilla_id IS NULL OR p_asociacion_id IS NULL
     OR p_actor_usuario_id IS NULL
     OR NULLIF(trim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'activacion_plantilla_requisitos_incompleta'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_asociacion_operativa(
    p_actor_usuario_id, p_asociacion_id
  );

  PERFORM pg_advisory_xact_lock(hashtextextended(p_asociacion_id::text, 0));

  SELECT * INTO v_plantilla
  FROM public.plantillas_requisitos_adopcion
  WHERE id = p_plantilla_id
    AND asociacion_id = p_asociacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'plantilla_requisitos_adopcion_no_encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_evento
  FROM public.historial_adopcion
  WHERE asociacion_id = p_asociacion_id
    AND idempotency_key = 'plantilla:activar:' || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_evento.plantilla_requisitos_id IS DISTINCT FROM p_plantilla_id THEN
      RAISE EXCEPTION 'idempotency_key_plantilla_activacion_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
      'id', v_plantilla.id,
      'version', v_plantilla.version,
      'estado', v_plantilla.estado,
      'updated_at', v_plantilla.actualizada_at,
      'event_id', v_evento.id,
      'reintento', true
    );
  END IF;

  IF v_plantilla.estado <> 'borrador' THEN
    RAISE EXCEPTION 'plantilla_requisitos_adopcion_no_activable'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.plantillas_requisitos_adopcion
  SET estado = 'retirada',
      retirada_por_usuario_id = p_actor_usuario_id,
      retirada_at = now()
  WHERE asociacion_id = p_asociacion_id
    AND estado = 'activa';
  GET DIAGNOSTICS v_retiradas = ROW_COUNT;

  UPDATE public.plantillas_requisitos_adopcion
  SET estado = 'activa',
      activada_por_usuario_id = p_actor_usuario_id,
      activada_at = now()
  WHERE id = p_plantilla_id
  RETURNING * INTO v_plantilla;

  INSERT INTO public.historial_adopcion (
    asociacion_id,
    plantilla_requisitos_id,
    actor_usuario_id,
    tipo_evento,
    estado_anterior,
    estado_nuevo,
    datos_extra,
    idempotency_key
  ) VALUES (
    p_asociacion_id,
    p_plantilla_id,
    p_actor_usuario_id,
    'plantilla_requisitos_adopcion_activada',
    'borrador',
    'activa',
    jsonb_build_object(
      'version', v_plantilla.version,
      'plantillas_retiradas', v_retiradas
    ),
    'plantilla:activar:' || trim(p_idempotency_key)
  ) RETURNING * INTO v_evento;

  RETURN jsonb_build_object(
    'id', v_plantilla.id,
    'version', v_plantilla.version,
    'estado', v_plantilla.estado,
    'updated_at', v_plantilla.actualizada_at,
    'event_id', v_evento.id,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.retirar_plantilla_requisitos_adopcion(
  p_plantilla_id uuid,
  p_asociacion_id uuid,
  p_actor_usuario_id uuid,
  p_motivo text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plantilla public.plantillas_requisitos_adopcion%ROWTYPE;
  v_evento public.historial_adopcion%ROWTYPE;
BEGIN
  IF p_plantilla_id IS NULL OR p_asociacion_id IS NULL
     OR p_actor_usuario_id IS NULL
     OR length(trim(COALESCE(p_motivo, ''))) NOT BETWEEN 1 AND 2000
     OR NULLIF(trim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'retiro_plantilla_requisitos_incompleto'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_asociacion_operativa(
    p_actor_usuario_id, p_asociacion_id
  );

  SELECT * INTO v_plantilla
  FROM public.plantillas_requisitos_adopcion
  WHERE id = p_plantilla_id
    AND asociacion_id = p_asociacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'plantilla_requisitos_adopcion_no_encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_evento
  FROM public.historial_adopcion
  WHERE asociacion_id = p_asociacion_id
    AND idempotency_key = 'plantilla:retirar:' || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_evento.plantilla_requisitos_id IS DISTINCT FROM p_plantilla_id
       OR v_evento.motivo IS DISTINCT FROM trim(p_motivo) THEN
      RAISE EXCEPTION 'idempotency_key_plantilla_retiro_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
      'id', v_plantilla.id,
      'version', v_plantilla.version,
      'estado', v_plantilla.estado,
      'updated_at', v_plantilla.actualizada_at,
      'event_id', v_evento.id,
      'reintento', true
    );
  END IF;

  IF v_plantilla.estado <> 'activa' THEN
    RAISE EXCEPTION 'plantilla_requisitos_adopcion_no_retirable'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.plantillas_requisitos_adopcion
  SET estado = 'retirada',
      retirada_por_usuario_id = p_actor_usuario_id,
      retirada_at = now()
  WHERE id = p_plantilla_id
  RETURNING * INTO v_plantilla;

  INSERT INTO public.historial_adopcion (
    asociacion_id,
    plantilla_requisitos_id,
    actor_usuario_id,
    tipo_evento,
    estado_anterior,
    estado_nuevo,
    motivo,
    datos_extra,
    idempotency_key
  ) VALUES (
    p_asociacion_id,
    p_plantilla_id,
    p_actor_usuario_id,
    'plantilla_requisitos_adopcion_retirada',
    'activa',
    'retirada',
    trim(p_motivo),
    jsonb_build_object('version', v_plantilla.version),
    'plantilla:retirar:' || trim(p_idempotency_key)
  ) RETURNING * INTO v_evento;

  RETURN jsonb_build_object(
    'id', v_plantilla.id,
    'version', v_plantilla.version,
    'estado', v_plantilla.estado,
    'updated_at', v_plantilla.actualizada_at,
    'event_id', v_evento.id,
    'reintento', false
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.preguntas_plantilla_adopcion_validas(jsonb),
  public.insertar_preguntas_plantilla_adopcion(uuid, jsonb),
  public.crear_plantilla_requisitos_adopcion(
    uuid, uuid, text, text, jsonb, text
  ),
  public.actualizar_plantilla_requisitos_adopcion(
    uuid, uuid, uuid, text, text, jsonb, text
  ),
  public.activar_plantilla_requisitos_adopcion(uuid, uuid, uuid, text),
  public.retirar_plantilla_requisitos_adopcion(
    uuid, uuid, uuid, text, text
  )
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.preguntas_plantilla_adopcion_validas(jsonb),
  public.insertar_preguntas_plantilla_adopcion(uuid, jsonb),
  public.crear_plantilla_requisitos_adopcion(
    uuid, uuid, text, text, jsonb, text
  ),
  public.actualizar_plantilla_requisitos_adopcion(
    uuid, uuid, uuid, text, text, jsonb, text
  ),
  public.activar_plantilla_requisitos_adopcion(uuid, uuid, uuid, text),
  public.retirar_plantilla_requisitos_adopcion(
    uuid, uuid, uuid, text, text
  )
TO service_role;

COMMENT ON FUNCTION public.crear_plantilla_requisitos_adopcion(
  uuid, uuid, text, text, jsonb, text
) IS
  'Crea la siguiente version borrador con preguntas adicionales validadas.';

COMMENT ON FUNCTION public.actualizar_plantilla_requisitos_adopcion(
  uuid, uuid, uuid, text, text, jsonb, text
) IS
  'Reemplaza atomicamente el contenido de una plantilla mientras sea borrador.';

COMMENT ON FUNCTION public.activar_plantilla_requisitos_adopcion(
  uuid, uuid, uuid, text
) IS
  'Activa una version y retira la anterior sin dejar dos plantillas activas.';

COMMENT ON FUNCTION public.retirar_plantilla_requisitos_adopcion(
  uuid, uuid, uuid, text, text
) IS
  'Retira requisitos adicionales; los requisitos base de PawAlert permanecen.';

COMMIT;

NOTIFY pgrst, 'reload schema';
