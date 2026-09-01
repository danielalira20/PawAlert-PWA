-- Editor privado de perfiles de adopcion y control de fotografias. Solo una
-- asociacion operativa puede modificar borradores o perfiles pausados. Estas
-- operaciones no publican, no cambian custodias y no exponen Storage.

BEGIN;

ALTER TABLE public.perfiles_adopcion
  DROP CONSTRAINT IF EXISTS perfiles_adopcion_revision_publicacion_consistente;

ALTER TABLE public.perfiles_adopcion
  ADD CONSTRAINT perfiles_adopcion_revision_publicacion_consistente CHECK (
    estado NOT IN ('publicado', 'en_proceso', 'adoptado')
    OR (
      revision_medica_confirmada = true
      AND revision_juridica_confirmada = true
      AND revision_publicacion_por_usuario_id IS NOT NULL
      AND revision_publicacion_at IS NOT NULL
      AND NULLIF(trim(requisitos_base_version), '') IS NOT NULL
    )
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.actualizar_borrador_perfil_adopcion(
  p_perfil_id uuid,
  p_asociacion_id uuid,
  p_actor_usuario_id uuid,
  p_datos jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_perfil public.perfiles_adopcion%ROWTYPE;
  v_evento public.historial_adopcion%ROWTYPE;
  v_campos_permitidos text[] := ARRAY[
    'nombre_publico',
    'tipo_animal_id',
    'tipo_animal_otro_id',
    'tamanio_id',
    'raza_id',
    'sexo',
    'edad_aproximada',
    'descripcion',
    'personalidad',
    'salud_conocida',
    'tratamientos',
    'necesidades_especiales',
    'vacunacion_estado',
    'esterilizacion_estado',
    'revision_medica_estado',
    'compatibilidad',
    'zona_general'
  ];
BEGIN
  IF p_perfil_id IS NULL OR p_asociacion_id IS NULL
     OR p_actor_usuario_id IS NULL
     OR p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object'
     OR p_datos = '{}'::jsonb
     OR NULLIF(trim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'actualizacion_perfil_incompleta'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_datos) AS clave
    WHERE NOT (clave = ANY(v_campos_permitidos))
  ) THEN
    RAISE EXCEPTION 'actualizacion_perfil_contiene_campos_no_permitidos'
      USING ERRCODE = '22023';
  END IF;

  IF p_datos ? 'compatibilidad'
     AND (
       p_datos->'compatibilidad' IS NULL
       OR jsonb_typeof(p_datos->'compatibilidad') <> 'object'
     ) THEN
    RAISE EXCEPTION 'compatibilidad_perfil_invalida'
      USING ERRCODE = '22023';
  END IF;

  IF p_datos ? 'vacunacion_estado'
     AND (
       p_datos->>'vacunacion_estado' IS NULL
       OR p_datos->>'vacunacion_estado' NOT IN (
         'desconocido', 'pendiente', 'parcial', 'completo', 'no_aplica'
       )
     ) THEN
    RAISE EXCEPTION 'vacunacion_estado_invalido' USING ERRCODE = '22023';
  END IF;

  IF p_datos ? 'esterilizacion_estado'
     AND (
       p_datos->>'esterilizacion_estado' IS NULL
       OR p_datos->>'esterilizacion_estado' NOT IN (
         'desconocido', 'pendiente', 'completo', 'no_aplica'
       )
     ) THEN
    RAISE EXCEPTION 'esterilizacion_estado_invalido'
      USING ERRCODE = '22023';
  END IF;

  IF p_datos ? 'revision_medica_estado'
     AND (
       p_datos->>'revision_medica_estado' IS NULL
       OR p_datos->>'revision_medica_estado' NOT IN (
         'desconocida', 'pendiente', 'declarada', 'verificada'
       )
     ) THEN
    RAISE EXCEPTION 'revision_medica_estado_invalido'
      USING ERRCODE = '22023';
  END IF;

  IF p_datos ? 'sexo'
     AND (
       p_datos->>'sexo' IS NULL
       OR p_datos->>'sexo' NOT IN ('macho', 'hembra', 'desconocido')
     ) THEN
    RAISE EXCEPTION 'sexo_perfil_invalido' USING ERRCODE = '22023';
  END IF;

  IF p_datos ? 'edad_aproximada'
     AND (
       p_datos->>'edad_aproximada' IS NULL
       OR p_datos->>'edad_aproximada' NOT IN (
         'cachorro', 'joven', 'adulto', 'senior', 'desconocido'
       )
     ) THEN
    RAISE EXCEPTION 'edad_aproximada_perfil_invalida'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_asociacion_operativa(
    p_actor_usuario_id, p_asociacion_id
  );

  SELECT * INTO v_perfil
  FROM public.perfiles_adopcion
  WHERE id = p_perfil_id
    AND asociacion_id = p_asociacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'perfil_adopcion_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_evento
  FROM public.historial_adopcion
  WHERE asociacion_id = p_asociacion_id
    AND idempotency_key = 'perfil:actualizar:' || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_evento.perfil_adopcion_id IS DISTINCT FROM p_perfil_id
       OR v_evento.datos_extra->'cambios' IS DISTINCT FROM p_datos THEN
      RAISE EXCEPTION 'idempotency_key_actualizacion_perfil_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
      'id', v_perfil.id,
      'estado', v_perfil.estado,
      'updated_at', v_perfil.actualizado_at,
      'event_id', v_evento.id,
      'reintento', true
    );
  END IF;

  IF v_perfil.estado NOT IN ('borrador', 'pausado') THEN
    RAISE EXCEPTION 'perfil_adopcion_no_editable' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.perfiles_adopcion
  SET nombre_publico = CASE
        WHEN p_datos ? 'nombre_publico'
          THEN NULLIF(trim(p_datos->>'nombre_publico'), '')
        ELSE nombre_publico
      END,
      tipo_animal_id = CASE
        WHEN p_datos ? 'tipo_animal_id'
          THEN NULLIF(p_datos->>'tipo_animal_id', '')::uuid
        ELSE tipo_animal_id
      END,
      tipo_animal_otro_id = CASE
        WHEN p_datos ? 'tipo_animal_otro_id'
          THEN NULLIF(p_datos->>'tipo_animal_otro_id', '')::uuid
        ELSE tipo_animal_otro_id
      END,
      tamanio_id = CASE
        WHEN p_datos ? 'tamanio_id'
          THEN NULLIF(p_datos->>'tamanio_id', '')::uuid
        ELSE tamanio_id
      END,
      raza_id = CASE
        WHEN p_datos ? 'raza_id'
          THEN NULLIF(p_datos->>'raza_id', '')::uuid
        ELSE raza_id
      END,
      sexo = CASE
        WHEN p_datos ? 'sexo' THEN NULLIF(trim(p_datos->>'sexo'), '')
        ELSE sexo
      END,
      edad_aproximada = CASE
        WHEN p_datos ? 'edad_aproximada'
          THEN NULLIF(trim(p_datos->>'edad_aproximada'), '')
        ELSE edad_aproximada
      END,
      descripcion = CASE
        WHEN p_datos ? 'descripcion'
          THEN NULLIF(trim(p_datos->>'descripcion'), '')
        ELSE descripcion
      END,
      personalidad = CASE
        WHEN p_datos ? 'personalidad'
          THEN NULLIF(trim(p_datos->>'personalidad'), '')
        ELSE personalidad
      END,
      salud_conocida = CASE
        WHEN p_datos ? 'salud_conocida'
          THEN NULLIF(trim(p_datos->>'salud_conocida'), '')
        ELSE salud_conocida
      END,
      tratamientos = CASE
        WHEN p_datos ? 'tratamientos'
          THEN NULLIF(trim(p_datos->>'tratamientos'), '')
        ELSE tratamientos
      END,
      necesidades_especiales = CASE
        WHEN p_datos ? 'necesidades_especiales'
          THEN NULLIF(trim(p_datos->>'necesidades_especiales'), '')
        ELSE necesidades_especiales
      END,
      vacunacion_estado = CASE
        WHEN p_datos ? 'vacunacion_estado'
          THEN p_datos->>'vacunacion_estado'
        ELSE vacunacion_estado
      END,
      esterilizacion_estado = CASE
        WHEN p_datos ? 'esterilizacion_estado'
          THEN p_datos->>'esterilizacion_estado'
        ELSE esterilizacion_estado
      END,
      revision_medica_estado = CASE
        WHEN p_datos ? 'revision_medica_estado'
          THEN p_datos->>'revision_medica_estado'
        ELSE revision_medica_estado
      END,
      compatibilidad = CASE
        WHEN p_datos ? 'compatibilidad' THEN p_datos->'compatibilidad'
        ELSE compatibilidad
      END,
      zona_general = CASE
        WHEN p_datos ? 'zona_general'
          THEN NULLIF(trim(p_datos->>'zona_general'), '')
        ELSE zona_general
      END,
      revision_medica_confirmada = false,
      revision_juridica_confirmada = false,
      revision_publicacion_por_usuario_id = NULL,
      revision_publicacion_at = NULL
  WHERE id = p_perfil_id
  RETURNING * INTO v_perfil;

  INSERT INTO public.historial_adopcion (
    asociacion_id,
    perfil_adopcion_id,
    actor_usuario_id,
    tipo_evento,
    estado_anterior,
    estado_nuevo,
    datos_extra,
    idempotency_key
  ) VALUES (
    p_asociacion_id,
    p_perfil_id,
    p_actor_usuario_id,
    'perfil_adopcion_actualizado',
    v_perfil.estado,
    v_perfil.estado,
    jsonb_build_object('cambios', p_datos),
    'perfil:actualizar:' || trim(p_idempotency_key)
  ) RETURNING * INTO v_evento;

  RETURN jsonb_build_object(
    'id', v_perfil.id,
    'estado', v_perfil.estado,
    'updated_at', v_perfil.actualizado_at,
    'event_id', v_evento.id,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_foto_perfil_adopcion(
  p_perfil_id uuid,
  p_asociacion_id uuid,
  p_actor_usuario_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_orden smallint,
  p_texto_alternativo text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_perfil public.perfiles_adopcion%ROWTYPE;
  v_foto public.fotos_perfil_adopcion%ROWTYPE;
  v_evento public.historial_adopcion%ROWTYPE;
  v_orden smallint;
BEGIN
  IF p_perfil_id IS NULL OR p_asociacion_id IS NULL
     OR p_actor_usuario_id IS NULL
     OR NULLIF(trim(p_storage_path), '') IS NULL
     OR p_mime_type IS NULL
     OR p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp')
     OR p_size_bytes IS NULL OR p_size_bytes < 1 OR p_size_bytes > 10485760
     OR (p_orden IS NOT NULL AND p_orden < 1)
     OR NULLIF(trim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'registro_foto_perfil_incompleto'
      USING ERRCODE = '22023';
  END IF;

  IF p_storage_path NOT LIKE (
       'adopciones/perfiles/' || p_perfil_id::text || '/%'
     ) OR p_storage_path ~ '(^|/)\.\.(/|$)' THEN
    RAISE EXCEPTION 'storage_path_foto_perfil_invalido'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_asociacion_operativa(
    p_actor_usuario_id, p_asociacion_id
  );

  SELECT * INTO v_perfil
  FROM public.perfiles_adopcion
  WHERE id = p_perfil_id
    AND asociacion_id = p_asociacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'perfil_adopcion_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_evento
  FROM public.historial_adopcion
  WHERE asociacion_id = p_asociacion_id
    AND idempotency_key = 'perfil:foto:registrar:' || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_evento.perfil_adopcion_id IS DISTINCT FROM p_perfil_id
       OR v_evento.datos_extra->>'storage_path' IS DISTINCT FROM p_storage_path
       OR v_evento.datos_extra->>'mime_type' IS DISTINCT FROM p_mime_type
       OR (v_evento.datos_extra->>'size_bytes')::bigint
          IS DISTINCT FROM p_size_bytes THEN
      RAISE EXCEPTION 'idempotency_key_registro_foto_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
      'id', (v_evento.datos_extra->>'foto_id')::uuid,
      'perfil_adopcion_id', p_perfil_id,
      'estado', v_perfil.estado,
      'orden', (v_evento.datos_extra->>'orden')::smallint,
      'updated_at', v_evento.creado_at,
      'event_id', v_evento.id,
      'reintento', true
    );
  END IF;

  IF v_perfil.estado NOT IN ('borrador', 'pausado') THEN
    RAISE EXCEPTION 'perfil_adopcion_no_editable' USING ERRCODE = 'P0001';
  END IF;

  IF (
    SELECT count(*) FROM public.fotos_perfil_adopcion foto
    WHERE foto.perfil_adopcion_id = p_perfil_id
  ) >= 8 THEN
    RAISE EXCEPTION 'perfil_adopcion_limite_fotos'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_orden IS NULL THEN
    SELECT (COALESCE(max(foto.orden), 0) + 1)::smallint
    INTO v_orden
    FROM public.fotos_perfil_adopcion foto
    WHERE foto.perfil_adopcion_id = p_perfil_id;
  ELSE
    v_orden := p_orden;
  END IF;

  INSERT INTO public.fotos_perfil_adopcion (
    perfil_adopcion_id,
    storage_path,
    mime_type,
    size_bytes,
    orden,
    texto_alternativo,
    subida_por_usuario_id
  ) VALUES (
    p_perfil_id,
    trim(p_storage_path),
    p_mime_type,
    p_size_bytes,
    v_orden,
    NULLIF(trim(p_texto_alternativo), ''),
    p_actor_usuario_id
  ) RETURNING * INTO v_foto;

  INSERT INTO public.historial_adopcion (
    asociacion_id,
    perfil_adopcion_id,
    actor_usuario_id,
    tipo_evento,
    estado_anterior,
    estado_nuevo,
    datos_extra,
    idempotency_key
  ) VALUES (
    p_asociacion_id,
    p_perfil_id,
    p_actor_usuario_id,
    'perfil_adopcion_foto_registrada',
    v_perfil.estado,
    v_perfil.estado,
    jsonb_build_object(
      'foto_id', v_foto.id,
      'storage_path', v_foto.storage_path,
      'mime_type', v_foto.mime_type,
      'size_bytes', v_foto.size_bytes,
      'orden', v_foto.orden
    ),
    'perfil:foto:registrar:' || trim(p_idempotency_key)
  ) RETURNING * INTO v_evento;

  RETURN jsonb_build_object(
    'id', v_foto.id,
    'perfil_adopcion_id', p_perfil_id,
    'estado', v_perfil.estado,
    'orden', v_foto.orden,
    'updated_at', v_foto.actualizada_at,
    'event_id', v_evento.id,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revisar_foto_perfil_adopcion(
  p_perfil_id uuid,
  p_foto_id uuid,
  p_asociacion_id uuid,
  p_actor_usuario_id uuid,
  p_aprobada boolean,
  p_motivo text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_perfil public.perfiles_adopcion%ROWTYPE;
  v_foto public.fotos_perfil_adopcion%ROWTYPE;
  v_evento public.historial_adopcion%ROWTYPE;
BEGIN
  IF p_perfil_id IS NULL OR p_foto_id IS NULL OR p_asociacion_id IS NULL
     OR p_actor_usuario_id IS NULL OR p_aprobada IS NULL
     OR (p_aprobada = false AND NULLIF(trim(p_motivo), '') IS NULL)
     OR NULLIF(trim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'revision_foto_perfil_incompleta'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_asociacion_operativa(
    p_actor_usuario_id, p_asociacion_id
  );

  SELECT * INTO v_perfil
  FROM public.perfiles_adopcion
  WHERE id = p_perfil_id
    AND asociacion_id = p_asociacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'perfil_adopcion_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_evento
  FROM public.historial_adopcion
  WHERE asociacion_id = p_asociacion_id
    AND idempotency_key = 'perfil:foto:revisar:' || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_evento.perfil_adopcion_id IS DISTINCT FROM p_perfil_id
       OR v_evento.datos_extra->>'foto_id' IS DISTINCT FROM p_foto_id::text
       OR (v_evento.datos_extra->>'aprobada')::boolean
          IS DISTINCT FROM p_aprobada
       OR v_evento.motivo IS DISTINCT FROM NULLIF(trim(p_motivo), '') THEN
      RAISE EXCEPTION 'idempotency_key_revision_foto_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
      'id', p_foto_id,
      'perfil_adopcion_id', p_perfil_id,
      'estado', v_perfil.estado,
      'aprobada_publicacion',
        (v_evento.datos_extra->>'aprobada')::boolean,
      'updated_at', v_evento.creado_at,
      'event_id', v_evento.id,
      'reintento', true
    );
  END IF;

  IF v_perfil.estado NOT IN ('borrador', 'pausado') THEN
    RAISE EXCEPTION 'perfil_adopcion_no_editable' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_foto
  FROM public.fotos_perfil_adopcion
  WHERE id = p_foto_id
    AND perfil_adopcion_id = p_perfil_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'foto_perfil_adopcion_no_encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.fotos_perfil_adopcion
  SET aprobada_publicacion = p_aprobada,
      aprobada_por_usuario_id = CASE
        WHEN p_aprobada THEN p_actor_usuario_id ELSE NULL
      END,
      aprobada_at = CASE WHEN p_aprobada THEN now() ELSE NULL END
  WHERE id = p_foto_id
  RETURNING * INTO v_foto;

  INSERT INTO public.historial_adopcion (
    asociacion_id,
    perfil_adopcion_id,
    actor_usuario_id,
    tipo_evento,
    estado_anterior,
    estado_nuevo,
    motivo,
    datos_extra,
    idempotency_key
  ) VALUES (
    p_asociacion_id,
    p_perfil_id,
    p_actor_usuario_id,
    CASE WHEN p_aprobada
      THEN 'perfil_adopcion_foto_aprobada'
      ELSE 'perfil_adopcion_foto_no_aprobada'
    END,
    v_perfil.estado,
    v_perfil.estado,
    NULLIF(trim(p_motivo), ''),
    jsonb_build_object('foto_id', p_foto_id, 'aprobada', p_aprobada),
    'perfil:foto:revisar:' || trim(p_idempotency_key)
  ) RETURNING * INTO v_evento;

  RETURN jsonb_build_object(
    'id', v_foto.id,
    'perfil_adopcion_id', p_perfil_id,
    'estado', v_perfil.estado,
    'aprobada_publicacion', v_foto.aprobada_publicacion,
    'updated_at', v_foto.actualizada_at,
    'event_id', v_evento.id,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.retirar_foto_perfil_adopcion(
  p_perfil_id uuid,
  p_foto_id uuid,
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
  v_perfil public.perfiles_adopcion%ROWTYPE;
  v_foto public.fotos_perfil_adopcion%ROWTYPE;
  v_evento public.historial_adopcion%ROWTYPE;
BEGIN
  IF p_perfil_id IS NULL OR p_foto_id IS NULL OR p_asociacion_id IS NULL
     OR p_actor_usuario_id IS NULL
     OR NULLIF(trim(p_motivo), '') IS NULL
     OR NULLIF(trim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'retiro_foto_perfil_incompleto'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_asociacion_operativa(
    p_actor_usuario_id, p_asociacion_id
  );

  SELECT * INTO v_perfil
  FROM public.perfiles_adopcion
  WHERE id = p_perfil_id
    AND asociacion_id = p_asociacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'perfil_adopcion_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_evento
  FROM public.historial_adopcion
  WHERE asociacion_id = p_asociacion_id
    AND idempotency_key = 'perfil:foto:retirar:' || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_evento.perfil_adopcion_id IS DISTINCT FROM p_perfil_id
       OR v_evento.datos_extra->>'foto_id' IS DISTINCT FROM p_foto_id::text
       OR v_evento.motivo IS DISTINCT FROM trim(p_motivo) THEN
      RAISE EXCEPTION 'idempotency_key_retiro_foto_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
      'id', p_foto_id,
      'perfil_adopcion_id', p_perfil_id,
      'estado', v_perfil.estado,
      'storage_path', v_evento.datos_extra->>'storage_path',
      'updated_at', v_evento.creado_at,
      'event_id', v_evento.id,
      'reintento', true
    );
  END IF;

  IF v_perfil.estado NOT IN ('borrador', 'pausado') THEN
    RAISE EXCEPTION 'perfil_adopcion_no_editable' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_foto
  FROM public.fotos_perfil_adopcion
  WHERE id = p_foto_id
    AND perfil_adopcion_id = p_perfil_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'foto_perfil_adopcion_no_encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.fotos_perfil_adopcion
  WHERE id = p_foto_id;

  INSERT INTO public.historial_adopcion (
    asociacion_id,
    perfil_adopcion_id,
    actor_usuario_id,
    tipo_evento,
    estado_anterior,
    estado_nuevo,
    motivo,
    datos_extra,
    idempotency_key
  ) VALUES (
    p_asociacion_id,
    p_perfil_id,
    p_actor_usuario_id,
    'perfil_adopcion_foto_retirada',
    v_perfil.estado,
    v_perfil.estado,
    trim(p_motivo),
    jsonb_build_object(
      'foto_id', v_foto.id,
      'storage_path', v_foto.storage_path,
      'orden', v_foto.orden
    ),
    'perfil:foto:retirar:' || trim(p_idempotency_key)
  ) RETURNING * INTO v_evento;

  RETURN jsonb_build_object(
    'id', v_foto.id,
    'perfil_adopcion_id', p_perfil_id,
    'estado', v_perfil.estado,
    'storage_path', v_foto.storage_path,
    'updated_at', v_evento.creado_at,
    'event_id', v_evento.id,
    'reintento', false
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.actualizar_borrador_perfil_adopcion(
    uuid, uuid, uuid, jsonb, text
  ),
  public.registrar_foto_perfil_adopcion(
    uuid, uuid, uuid, text, text, bigint, smallint, text, text
  ),
  public.revisar_foto_perfil_adopcion(
    uuid, uuid, uuid, uuid, boolean, text, text
  ),
  public.retirar_foto_perfil_adopcion(
    uuid, uuid, uuid, uuid, text, text
  )
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.actualizar_borrador_perfil_adopcion(
    uuid, uuid, uuid, jsonb, text
  ),
  public.registrar_foto_perfil_adopcion(
    uuid, uuid, uuid, text, text, bigint, smallint, text, text
  ),
  public.revisar_foto_perfil_adopcion(
    uuid, uuid, uuid, uuid, boolean, text, text
  ),
  public.retirar_foto_perfil_adopcion(
    uuid, uuid, uuid, uuid, text, text
  )
TO service_role;

COMMENT ON FUNCTION public.actualizar_borrador_perfil_adopcion(
  uuid, uuid, uuid, jsonb, text
) IS
  'Actualiza solo campos publicables de un borrador o perfil pausado e invalida su revision anterior.';

COMMENT ON FUNCTION public.registrar_foto_perfil_adopcion(
  uuid, uuid, uuid, text, text, bigint, smallint, text, text
) IS
  'Registra metadatos de una foto privada ya cargada; nunca la aprueba automaticamente.';

COMMENT ON FUNCTION public.retirar_foto_perfil_adopcion(
  uuid, uuid, uuid, uuid, text, text
) IS
  'Retira la referencia de una foto editable y devuelve su path para limpieza de Storage.';

COMMIT;

NOTIFY pgrst, 'reload schema';
