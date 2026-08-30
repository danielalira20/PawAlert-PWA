-- Operaciones atomicas para el ciclo de vida manual de eventos publicos.
-- No crea reportes, reservas, pagos, rutas ni solicitudes de adopcion.

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_payload_evento_asociacion(
  p_datos jsonb
) RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campos_no_permitidos text[];
BEGIN
  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'payload_evento_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(campo ORDER BY campo)
  INTO v_campos_no_permitidos
  FROM jsonb_object_keys(p_datos) AS campo
  WHERE campo <> ALL (ARRAY[
    'responsable_operativo_usuario_id',
    'tipo',
    'categoria_otro',
    'titulo',
    'descripcion',
    'inicia_at',
    'termina_at',
    'zona_horaria',
    'lugar_nombre',
    'direccion_publica',
    'municipio',
    'estado_ubicacion',
    'latitud',
    'longitud',
    'modalidad_acceso',
    'enlace_registro_externo',
    'instrucciones_contacto',
    'especies_objetivo',
    'publico_objetivo',
    'requisitos_asistencia',
    'servicios_detalle',
    'condiciones_excluidas',
    'documentos_requeridos',
    'contacto_institucional_nombre',
    'contacto_institucional_telefono',
    'contacto_institucional_email',
    'es_gratuito',
    'costo_centavos',
    'moneda',
    'detalle_costos',
    'cupo_total',
    'cupo_estado',
    'responsable_profesional',
    'cedula_profesional',
    'institucion_profesional',
    'datos_profesionales_estado',
    'accesibilidad',
    'transporte'
  ]::text[]);

  IF v_campos_no_permitidos IS NOT NULL THEN
    RAISE EXCEPTION 'payload_evento_campos_no_permitidos: %',
      array_to_string(v_campos_no_permitidos, ',')
      USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_responsable_operativo_evento(
  p_responsable_usuario_id uuid,
  p_asociacion_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_valido boolean;
BEGIN
  IF p_responsable_usuario_id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios usuario
    JOIN public.roles rol ON rol.id = usuario.rol_id
    WHERE usuario.id = p_responsable_usuario_id
      AND usuario.asociacion_id = p_asociacion_id
      AND rol.nombre IN ('asociacion', 'staff')
      AND COALESCE(rol.activo, false) = true
  ) INTO v_valido;

  IF COALESCE(v_valido, false) = false THEN
    RAISE EXCEPTION 'responsable_operativo_no_pertenece_asociacion'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.snapshot_publico_evento_asociacion(
  p_evento_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_evento public.eventos_asociacion%ROWTYPE;
BEGIN
  SELECT * INTO v_evento
  FROM public.eventos_asociacion
  WHERE id = p_evento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'evento_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'id', v_evento.id,
    'asociacion_id', v_evento.asociacion_id,
    'tipo', v_evento.tipo,
    'categoria_otro', v_evento.categoria_otro,
    'titulo', v_evento.titulo,
    'descripcion', v_evento.descripcion,
    'inicia_at', v_evento.inicia_at,
    'termina_at', v_evento.termina_at,
    'zona_horaria', v_evento.zona_horaria,
    'lugar_nombre', v_evento.lugar_nombre,
    'direccion_publica', v_evento.direccion_publica,
    'municipio', v_evento.municipio,
    'estado_ubicacion', v_evento.estado_ubicacion,
    'latitud', v_evento.latitud,
    'longitud', v_evento.longitud,
    'modalidad_acceso', v_evento.modalidad_acceso,
    'enlace_registro_externo', v_evento.enlace_registro_externo,
    'instrucciones_contacto', v_evento.instrucciones_contacto,
    'especies_objetivo', v_evento.especies_objetivo,
    'publico_objetivo', v_evento.publico_objetivo,
    'requisitos_asistencia', v_evento.requisitos_asistencia,
    'servicios_detalle', v_evento.servicios_detalle,
    'condiciones_excluidas', v_evento.condiciones_excluidas,
    'documentos_requeridos', v_evento.documentos_requeridos,
    'contacto_institucional_nombre',
      v_evento.contacto_institucional_nombre,
    'contacto_institucional_telefono',
      v_evento.contacto_institucional_telefono,
    'contacto_institucional_email', v_evento.contacto_institucional_email,
    'es_gratuito', v_evento.es_gratuito,
    'costo_centavos', v_evento.costo_centavos,
    'moneda', v_evento.moneda,
    'detalle_costos', v_evento.detalle_costos,
    'cupo_total', v_evento.cupo_total,
    'cupo_estado', v_evento.cupo_estado,
    'responsable_profesional', v_evento.responsable_profesional,
    'cedula_profesional', v_evento.cedula_profesional,
    'institucion_profesional', v_evento.institucion_profesional,
    'datos_profesionales_estado', v_evento.datos_profesionales_estado,
    'imagen_texto_alternativo', v_evento.imagen_texto_alternativo,
    'accesibilidad', v_evento.accesibilidad,
    'transporte', v_evento.transporte,
    'estado', v_evento.estado,
    'version_publica', v_evento.version_publica,
    'publicado_at', v_evento.publicado_at,
    'actualizada_at', v_evento.actualizada_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crear_borrador_evento_asociacion(
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
  v_evento public.eventos_asociacion%ROWTYPE;
  v_datos public.eventos_asociacion%ROWTYPE;
  v_historial public.historial_evento%ROWTYPE;
  v_payload_hash text;
BEGIN
  IF p_asociacion_id IS NULL OR p_actor_usuario_id IS NULL
     OR length(trim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'creacion_evento_incompleta' USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_asociacion_operativa(
    p_actor_usuario_id, p_asociacion_id
  );
  PERFORM public.validar_payload_evento_asociacion(p_datos);

  v_payload_hash := encode(digest(p_datos::text, 'sha256'), 'hex');

  SELECT * INTO v_evento
  FROM public.eventos_asociacion
  WHERE asociacion_id = p_asociacion_id
    AND idempotency_key = trim(p_idempotency_key);

  IF FOUND THEN
    SELECT * INTO v_historial
    FROM public.historial_evento
    WHERE evento_id = v_evento.id
      AND idempotency_key =
        'evento:crear:' || p_actor_usuario_id::text || ':'
        || trim(p_idempotency_key);

    IF NOT FOUND
       OR v_historial.datos_extra->>'payload_hash'
          IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'idempotency_key_creacion_evento_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
      'id', v_evento.id,
      'estado', v_evento.estado,
      'version_publica', v_evento.version_publica,
      'updated_at', v_evento.actualizada_at,
      'event_id', v_historial.id,
      'reintento', true
    );
  END IF;

  v_datos := jsonb_populate_record(
    NULL::public.eventos_asociacion,
    p_datos
  );
  PERFORM public.validar_responsable_operativo_evento(
    v_datos.responsable_operativo_usuario_id,
    p_asociacion_id
  );

  INSERT INTO public.eventos_asociacion (
    asociacion_id,
    creado_por_usuario_id,
    responsable_operativo_usuario_id,
    tipo,
    categoria_otro,
    titulo,
    descripcion,
    inicia_at,
    termina_at,
    zona_horaria,
    lugar_nombre,
    direccion_publica,
    municipio,
    estado_ubicacion,
    latitud,
    longitud,
    modalidad_acceso,
    enlace_registro_externo,
    instrucciones_contacto,
    especies_objetivo,
    publico_objetivo,
    requisitos_asistencia,
    servicios_detalle,
    condiciones_excluidas,
    documentos_requeridos,
    contacto_institucional_nombre,
    contacto_institucional_telefono,
    contacto_institucional_email,
    es_gratuito,
    costo_centavos,
    moneda,
    detalle_costos,
    cupo_total,
    cupo_estado,
    responsable_profesional,
    cedula_profesional,
    institucion_profesional,
    datos_profesionales_estado,
    accesibilidad,
    transporte,
    idempotency_key
  ) VALUES (
    p_asociacion_id,
    p_actor_usuario_id,
    v_datos.responsable_operativo_usuario_id,
    v_datos.tipo,
    NULLIF(trim(v_datos.categoria_otro), ''),
    NULLIF(trim(v_datos.titulo), ''),
    NULLIF(trim(v_datos.descripcion), ''),
    v_datos.inicia_at,
    v_datos.termina_at,
    NULLIF(trim(v_datos.zona_horaria), ''),
    NULLIF(trim(v_datos.lugar_nombre), ''),
    NULLIF(trim(v_datos.direccion_publica), ''),
    NULLIF(trim(v_datos.municipio), ''),
    NULLIF(trim(v_datos.estado_ubicacion), ''),
    v_datos.latitud,
    v_datos.longitud,
    v_datos.modalidad_acceso,
    NULLIF(trim(v_datos.enlace_registro_externo), ''),
    NULLIF(trim(v_datos.instrucciones_contacto), ''),
    COALESCE(v_datos.especies_objetivo, '[]'::jsonb),
    NULLIF(trim(v_datos.publico_objetivo), ''),
    NULLIF(trim(v_datos.requisitos_asistencia), ''),
    NULLIF(trim(v_datos.servicios_detalle), ''),
    COALESCE(v_datos.condiciones_excluidas, '[]'::jsonb),
    COALESCE(v_datos.documentos_requeridos, '[]'::jsonb),
    NULLIF(trim(v_datos.contacto_institucional_nombre), ''),
    NULLIF(trim(v_datos.contacto_institucional_telefono), ''),
    NULLIF(trim(v_datos.contacto_institucional_email), ''),
    v_datos.es_gratuito,
    v_datos.costo_centavos,
    COALESCE(NULLIF(trim(v_datos.moneda), ''), 'MXN'),
    NULLIF(trim(v_datos.detalle_costos), ''),
    v_datos.cupo_total,
    COALESCE(v_datos.cupo_estado, 'no_aplica'),
    NULLIF(trim(v_datos.responsable_profesional), ''),
    NULLIF(trim(v_datos.cedula_profesional), ''),
    NULLIF(trim(v_datos.institucion_profesional), ''),
    COALESCE(v_datos.datos_profesionales_estado, 'no_aplica'),
    NULLIF(trim(v_datos.accesibilidad), ''),
    NULLIF(trim(v_datos.transporte), ''),
    trim(p_idempotency_key)
  ) RETURNING * INTO v_evento;

  INSERT INTO public.historial_evento (
    evento_id,
    asociacion_id,
    actor_usuario_id,
    tipo_evento,
    estado_nuevo,
    campos_modificados,
    datos_extra,
    version_publica,
    idempotency_key
  ) VALUES (
    v_evento.id,
    p_asociacion_id,
    p_actor_usuario_id,
    'evento_creado',
    'borrador',
    COALESCE(
      (SELECT jsonb_agg(campo ORDER BY campo)
       FROM jsonb_object_keys(p_datos) AS campo),
      '[]'::jsonb
    ),
    jsonb_build_object('payload_hash', v_payload_hash),
    0,
    'evento:crear:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key)
  ) RETURNING * INTO v_historial;

  RETURN jsonb_build_object(
    'id', v_evento.id,
    'estado', v_evento.estado,
    'version_publica', v_evento.version_publica,
    'updated_at', v_evento.actualizada_at,
    'event_id', v_historial.id,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.actualizar_evento_asociacion(
  p_evento_id uuid,
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
  v_anterior public.eventos_asociacion%ROWTYPE;
  v_nuevo public.eventos_asociacion%ROWTYPE;
  v_datos public.eventos_asociacion%ROWTYPE;
  v_historial public.historial_evento%ROWTYPE;
  v_payload_hash text;
  v_campos_modificados jsonb;
  v_usuario_guardado record;
BEGIN
  IF p_evento_id IS NULL OR p_asociacion_id IS NULL
     OR p_actor_usuario_id IS NULL
     OR length(trim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'actualizacion_evento_incompleta'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_asociacion_operativa(
    p_actor_usuario_id, p_asociacion_id
  );
  PERFORM public.validar_payload_evento_asociacion(p_datos);

  IF p_datos = '{}'::jsonb THEN
    RAISE EXCEPTION 'actualizacion_evento_sin_campos'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_anterior
  FROM public.eventos_asociacion
  WHERE id = p_evento_id
    AND asociacion_id = p_asociacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'evento_no_encontrado_asociacion'
      USING ERRCODE = 'P0002';
  END IF;

  v_payload_hash := encode(digest(p_datos::text, 'sha256'), 'hex');
  SELECT * INTO v_historial
  FROM public.historial_evento
  WHERE asociacion_id = p_asociacion_id
    AND idempotency_key =
      'evento:actualizar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_historial.evento_id IS DISTINCT FROM p_evento_id
       OR v_historial.datos_extra->>'payload_hash'
          IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'idempotency_key_actualizacion_evento_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_nuevo
    FROM public.eventos_asociacion
    WHERE id = p_evento_id;

    RETURN jsonb_build_object(
      'id', v_nuevo.id,
      'estado', v_nuevo.estado,
      'version_publica', v_nuevo.version_publica,
      'updated_at', v_nuevo.actualizada_at,
      'event_id', v_historial.id,
      'reintento', true
    );
  END IF;

  IF v_anterior.estado NOT IN ('borrador', 'publicado', 'pausado') THEN
    RAISE EXCEPTION 'evento_no_editable' USING ERRCODE = 'P0001';
  END IF;

  v_datos := jsonb_populate_record(v_anterior, p_datos);
  PERFORM public.validar_responsable_operativo_evento(
    v_datos.responsable_operativo_usuario_id,
    p_asociacion_id
  );

  IF v_anterior.version_publica > 0
     AND (v_datos.termina_at IS NULL OR v_datos.termina_at <= now()) THEN
    RAISE EXCEPTION 'evento_publicado_no_puede_quedar_vencido'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.eventos_asociacion
  SET responsable_operativo_usuario_id = v_datos.responsable_operativo_usuario_id,
      tipo = v_datos.tipo,
      categoria_otro = NULLIF(trim(v_datos.categoria_otro), ''),
      titulo = NULLIF(trim(v_datos.titulo), ''),
      descripcion = NULLIF(trim(v_datos.descripcion), ''),
      inicia_at = v_datos.inicia_at,
      termina_at = v_datos.termina_at,
      zona_horaria = NULLIF(trim(v_datos.zona_horaria), ''),
      lugar_nombre = NULLIF(trim(v_datos.lugar_nombre), ''),
      direccion_publica = NULLIF(trim(v_datos.direccion_publica), ''),
      municipio = NULLIF(trim(v_datos.municipio), ''),
      estado_ubicacion = NULLIF(trim(v_datos.estado_ubicacion), ''),
      latitud = v_datos.latitud,
      longitud = v_datos.longitud,
      modalidad_acceso = v_datos.modalidad_acceso,
      enlace_registro_externo =
        NULLIF(trim(v_datos.enlace_registro_externo), ''),
      instrucciones_contacto =
        NULLIF(trim(v_datos.instrucciones_contacto), ''),
      especies_objetivo = v_datos.especies_objetivo,
      publico_objetivo = NULLIF(trim(v_datos.publico_objetivo), ''),
      requisitos_asistencia =
        NULLIF(trim(v_datos.requisitos_asistencia), ''),
      servicios_detalle = NULLIF(trim(v_datos.servicios_detalle), ''),
      condiciones_excluidas = v_datos.condiciones_excluidas,
      documentos_requeridos = v_datos.documentos_requeridos,
      contacto_institucional_nombre =
        NULLIF(trim(v_datos.contacto_institucional_nombre), ''),
      contacto_institucional_telefono =
        NULLIF(trim(v_datos.contacto_institucional_telefono), ''),
      contacto_institucional_email =
        NULLIF(trim(v_datos.contacto_institucional_email), ''),
      es_gratuito = v_datos.es_gratuito,
      costo_centavos = v_datos.costo_centavos,
      moneda = v_datos.moneda,
      detalle_costos = NULLIF(trim(v_datos.detalle_costos), ''),
      cupo_total = v_datos.cupo_total,
      cupo_estado = v_datos.cupo_estado,
      responsable_profesional =
        NULLIF(trim(v_datos.responsable_profesional), ''),
      cedula_profesional = NULLIF(trim(v_datos.cedula_profesional), ''),
      institucion_profesional =
        NULLIF(trim(v_datos.institucion_profesional), ''),
      datos_profesionales_estado = v_datos.datos_profesionales_estado,
      accesibilidad = NULLIF(trim(v_datos.accesibilidad), ''),
      transporte = NULLIF(trim(v_datos.transporte), ''),
      version_publica = CASE
        WHEN v_anterior.version_publica > 0
        THEN v_anterior.version_publica + 1
        ELSE v_anterior.version_publica
      END
  WHERE id = p_evento_id
  RETURNING * INTO v_nuevo;

  SELECT COALESCE(jsonb_agg(campo ORDER BY campo), '[]'::jsonb)
  INTO v_campos_modificados
  FROM jsonb_object_keys(p_datos) AS campo
  WHERE to_jsonb(v_anterior)->campo IS DISTINCT FROM to_jsonb(v_nuevo)->campo;

  IF jsonb_array_length(v_campos_modificados) = 0 THEN
    RAISE EXCEPTION 'actualizacion_evento_sin_cambios'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_nuevo.version_publica > v_anterior.version_publica THEN
    INSERT INTO public.versiones_evento_asociacion (
      evento_id,
      version,
      snapshot_publico,
      campos_modificados,
      creada_por_usuario_id
    ) VALUES (
      v_nuevo.id,
      v_nuevo.version_publica,
      public.snapshot_publico_evento_asociacion(v_nuevo.id),
      v_campos_modificados,
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
    v_nuevo.id,
    p_asociacion_id,
    p_actor_usuario_id,
    'evento_actualizado',
    v_anterior.estado,
    v_nuevo.estado,
    v_campos_modificados,
    jsonb_build_object('payload_hash', v_payload_hash),
    v_nuevo.version_publica,
    'evento:actualizar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key)
  ) RETURNING * INTO v_historial;

  IF v_nuevo.version_publica > 0 THEN
    FOR v_usuario_guardado IN
      SELECT usuario_id
      FROM public.eventos_guardados
      WHERE evento_id = v_nuevo.id
    LOOP
      BEGIN
        PERFORM public.encolar_notificacion_modulo(
          v_usuario_guardado.usuario_id,
          'evento_actualizado',
          'evento:actualizado:' || v_historial.id::text,
          jsonb_build_object(
            'evento_id', v_nuevo.id,
            'estado', v_nuevo.estado,
            'version_publica', v_nuevo.version_publica,
            'campos_modificados', v_campos_modificados
          ),
          NULL,
          NULL,
          v_nuevo.id
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'No se pudo encolar evento_actualizado: %', SQLERRM;
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'id', v_nuevo.id,
    'estado', v_nuevo.estado,
    'version_publica', v_nuevo.version_publica,
    'updated_at', v_nuevo.actualizada_at,
    'event_id', v_historial.id,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.publicar_evento_asociacion(
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
  v_evento public.eventos_asociacion%ROWTYPE;
  v_historial public.historial_evento%ROWTYPE;
  v_estado_anterior text;
  v_usuario_guardado record;
BEGIN
  IF p_evento_id IS NULL OR p_asociacion_id IS NULL
     OR p_actor_usuario_id IS NULL
     OR length(trim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'publicacion_evento_incompleta'
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
      'evento:publicar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_historial.evento_id IS DISTINCT FROM p_evento_id THEN
      RAISE EXCEPTION 'idempotency_key_publicacion_evento_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
      'id', v_evento.id,
      'estado', v_evento.estado,
      'version_publica', v_evento.version_publica,
      'updated_at', v_evento.actualizada_at,
      'event_id', v_historial.id,
      'reintento', true
    );
  END IF;

  IF v_evento.estado NOT IN ('borrador', 'pausado') THEN
    RAISE EXCEPTION 'evento_no_publicable' USING ERRCODE = 'P0001';
  END IF;

  IF v_evento.termina_at IS NULL OR v_evento.termina_at <= now() THEN
    RAISE EXCEPTION 'evento_terminado_no_publicable'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_responsable_operativo_evento(
    v_evento.responsable_operativo_usuario_id,
    p_asociacion_id
  );

  v_estado_anterior := v_evento.estado;
  UPDATE public.eventos_asociacion
  SET estado = 'publicado',
      version_publica = version_publica + 1,
      publicado_at = COALESCE(publicado_at, now()),
      pausado_at = NULL
  WHERE id = p_evento_id
  RETURNING * INTO v_evento;

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
    jsonb_build_array('estado'),
    p_actor_usuario_id
  );

  INSERT INTO public.historial_evento (
    evento_id,
    asociacion_id,
    actor_usuario_id,
    tipo_evento,
    estado_anterior,
    estado_nuevo,
    campos_modificados,
    version_publica,
    idempotency_key
  ) VALUES (
    v_evento.id,
    p_asociacion_id,
    p_actor_usuario_id,
    'evento_publicado',
    v_estado_anterior,
    'publicado',
    jsonb_build_array('estado'),
    v_evento.version_publica,
    'evento:publicar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key)
  ) RETURNING * INTO v_historial;

  IF v_estado_anterior = 'pausado' THEN
    FOR v_usuario_guardado IN
      SELECT usuario_id
      FROM public.eventos_guardados
      WHERE evento_id = v_evento.id
    LOOP
      BEGIN
        PERFORM public.encolar_notificacion_modulo(
          v_usuario_guardado.usuario_id,
          'evento_publicado',
          'evento:reanudado:' || v_historial.id::text,
          jsonb_build_object(
            'evento_id', v_evento.id,
            'estado', v_evento.estado,
            'version_publica', v_evento.version_publica
          ),
          NULL,
          NULL,
          v_evento.id
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'No se pudo encolar evento_publicado: %', SQLERRM;
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'id', v_evento.id,
    'estado', v_evento.estado,
    'version_publica', v_evento.version_publica,
    'updated_at', v_evento.actualizada_at,
    'event_id', v_historial.id,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pausar_evento_asociacion(
  p_evento_id uuid,
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
  v_evento public.eventos_asociacion%ROWTYPE;
  v_historial public.historial_evento%ROWTYPE;
  v_payload_hash text;
  v_usuario_guardado record;
BEGIN
  IF p_evento_id IS NULL OR p_asociacion_id IS NULL
     OR p_actor_usuario_id IS NULL
     OR length(trim(COALESCE(p_motivo, ''))) NOT BETWEEN 1 AND 1000
     OR length(trim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'pausa_evento_incompleta' USING ERRCODE = '22023';
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

  v_payload_hash := encode(digest(trim(p_motivo), 'sha256'), 'hex');
  SELECT * INTO v_historial
  FROM public.historial_evento
  WHERE asociacion_id = p_asociacion_id
    AND idempotency_key =
      'evento:pausar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_historial.evento_id IS DISTINCT FROM p_evento_id
       OR v_historial.datos_extra->>'payload_hash'
          IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'idempotency_key_pausa_evento_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
      'id', v_evento.id,
      'estado', v_evento.estado,
      'version_publica', v_evento.version_publica,
      'updated_at', v_evento.actualizada_at,
      'event_id', v_historial.id,
      'reintento', true
    );
  END IF;

  IF v_evento.estado <> 'publicado' THEN
    RAISE EXCEPTION 'evento_no_pausable' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.eventos_asociacion
  SET estado = 'pausado',
      pausado_at = now()
  WHERE id = p_evento_id
  RETURNING * INTO v_evento;

  INSERT INTO public.historial_evento (
    evento_id,
    asociacion_id,
    actor_usuario_id,
    tipo_evento,
    estado_anterior,
    estado_nuevo,
    motivo,
    campos_modificados,
    datos_extra,
    version_publica,
    idempotency_key
  ) VALUES (
    v_evento.id,
    p_asociacion_id,
    p_actor_usuario_id,
    'evento_pausado',
    'publicado',
    'pausado',
    trim(p_motivo),
    jsonb_build_array('estado'),
    jsonb_build_object('payload_hash', v_payload_hash),
    v_evento.version_publica,
    'evento:pausar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key)
  ) RETURNING * INTO v_historial;

  FOR v_usuario_guardado IN
    SELECT usuario_id
    FROM public.eventos_guardados
    WHERE evento_id = v_evento.id
  LOOP
    BEGIN
      PERFORM public.encolar_notificacion_modulo(
        v_usuario_guardado.usuario_id,
        'evento_pausado',
        'evento:pausado:' || v_historial.id::text,
        jsonb_build_object(
          'evento_id', v_evento.id,
          'estado', v_evento.estado
        ),
        NULL,
        NULL,
        v_evento.id
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'No se pudo encolar evento_pausado: %', SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_evento.id,
    'estado', v_evento.estado,
    'version_publica', v_evento.version_publica,
    'updated_at', v_evento.actualizada_at,
    'event_id', v_historial.id,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_evento_asociacion(
  p_evento_id uuid,
  p_asociacion_id uuid,
  p_actor_usuario_id uuid,
  p_motivo_publico text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_evento public.eventos_asociacion%ROWTYPE;
  v_historial public.historial_evento%ROWTYPE;
  v_estado_anterior text;
  v_payload_hash text;
  v_usuario_guardado record;
BEGIN
  IF p_evento_id IS NULL OR p_asociacion_id IS NULL
     OR p_actor_usuario_id IS NULL
     OR length(trim(COALESCE(p_motivo_publico, ''))) NOT BETWEEN 1 AND 1000
     OR length(trim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'cancelacion_evento_incompleta'
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

  v_payload_hash := encode(digest(trim(p_motivo_publico), 'sha256'), 'hex');
  SELECT * INTO v_historial
  FROM public.historial_evento
  WHERE asociacion_id = p_asociacion_id
    AND idempotency_key =
      'evento:cancelar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_historial.evento_id IS DISTINCT FROM p_evento_id
       OR v_historial.datos_extra->>'payload_hash'
          IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'idempotency_key_cancelacion_evento_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
      'id', v_evento.id,
      'estado', v_evento.estado,
      'version_publica', v_evento.version_publica,
      'updated_at', v_evento.actualizada_at,
      'event_id', v_historial.id,
      'reintento', true
    );
  END IF;

  IF v_evento.estado NOT IN ('publicado', 'pausado') THEN
    RAISE EXCEPTION 'evento_no_cancelable' USING ERRCODE = 'P0001';
  END IF;

  v_estado_anterior := v_evento.estado;
  UPDATE public.eventos_asociacion
  SET estado = 'cancelado',
      cancelado_at = now(),
      cancelado_por_usuario_id = p_actor_usuario_id,
      motivo_cancelacion_publico = trim(p_motivo_publico)
  WHERE id = p_evento_id
  RETURNING * INTO v_evento;

  INSERT INTO public.historial_evento (
    evento_id,
    asociacion_id,
    actor_usuario_id,
    tipo_evento,
    estado_anterior,
    estado_nuevo,
    motivo,
    campos_modificados,
    datos_extra,
    version_publica,
    idempotency_key
  ) VALUES (
    v_evento.id,
    p_asociacion_id,
    p_actor_usuario_id,
    'evento_cancelado',
    v_estado_anterior,
    'cancelado',
    trim(p_motivo_publico),
    jsonb_build_array('estado', 'motivo_cancelacion_publico'),
    jsonb_build_object('payload_hash', v_payload_hash),
    v_evento.version_publica,
    'evento:cancelar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key)
  ) RETURNING * INTO v_historial;

  FOR v_usuario_guardado IN
    SELECT usuario_id
    FROM public.eventos_guardados
    WHERE evento_id = v_evento.id
  LOOP
    BEGIN
      PERFORM public.encolar_notificacion_modulo(
        v_usuario_guardado.usuario_id,
        'evento_cancelado',
        'evento:cancelado:' || v_historial.id::text,
        jsonb_build_object(
          'evento_id', v_evento.id,
          'estado', v_evento.estado,
          'motivo_publico', v_evento.motivo_cancelacion_publico
        ),
        NULL,
        NULL,
        v_evento.id
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'No se pudo encolar evento_cancelado: %', SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_evento.id,
    'estado', v_evento.estado,
    'version_publica', v_evento.version_publica,
    'updated_at', v_evento.actualizada_at,
    'event_id', v_historial.id,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.guardar_evento_asociacion(
  p_evento_id uuid,
  p_actor_usuario_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_evento public.eventos_asociacion%ROWTYPE;
  v_guardado public.eventos_guardados%ROWTYPE;
  v_historial public.historial_evento%ROWTYPE;
BEGIN
  IF p_evento_id IS NULL OR p_actor_usuario_id IS NULL
     OR length(trim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'guardado_evento_incompleto' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios WHERE id = p_actor_usuario_id
  ) THEN
    RAISE EXCEPTION 'actor_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  SELECT evento.* INTO v_evento
  FROM public.eventos_asociacion evento
  JOIN public.asociaciones asociacion ON asociacion.id = evento.asociacion_id
  WHERE evento.id = p_evento_id
    AND evento.estado = 'publicado'
    AND evento.termina_at > now()
    AND COALESCE(asociacion.verificado, false) = true
    AND COALESCE(asociacion.activo, false) = true
  FOR UPDATE OF evento;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'evento_no_disponible_para_guardar'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_guardado
  FROM public.eventos_guardados
  WHERE usuario_id = p_actor_usuario_id
    AND idempotency_key = trim(p_idempotency_key);

  IF FOUND THEN
    IF v_guardado.evento_id IS DISTINCT FROM p_evento_id THEN
      RAISE EXCEPTION 'idempotency_key_guardado_evento_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_historial
    FROM public.historial_evento
    WHERE asociacion_id = v_evento.asociacion_id
      AND idempotency_key =
        'evento:guardar:' || p_actor_usuario_id::text || ':'
        || trim(p_idempotency_key);

    RETURN jsonb_build_object(
      'id', v_guardado.id,
      'evento_id', v_guardado.evento_id,
      'guardado', true,
      'event_id', v_historial.id,
      'reintento', true
    );
  END IF;

  SELECT * INTO v_guardado
  FROM public.eventos_guardados
  WHERE evento_id = p_evento_id
    AND usuario_id = p_actor_usuario_id;

  IF FOUND THEN
    IF v_guardado.idempotency_key IS DISTINCT FROM trim(p_idempotency_key) THEN
      RAISE EXCEPTION 'evento_ya_guardado' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_historial
    FROM public.historial_evento
    WHERE evento_id = p_evento_id
      AND idempotency_key =
        'evento:guardar:' || p_actor_usuario_id::text || ':'
        || trim(p_idempotency_key);

    RETURN jsonb_build_object(
      'id', v_guardado.id,
      'evento_id', v_guardado.evento_id,
      'guardado', true,
      'event_id', v_historial.id,
      'reintento', true
    );
  END IF;

  INSERT INTO public.eventos_guardados (
    evento_id,
    usuario_id,
    idempotency_key
  ) VALUES (
    p_evento_id,
    p_actor_usuario_id,
    trim(p_idempotency_key)
  ) RETURNING * INTO v_guardado;

  INSERT INTO public.historial_evento (
    evento_id,
    asociacion_id,
    actor_usuario_id,
    tipo_evento,
    estado_anterior,
    estado_nuevo,
    datos_extra,
    version_publica,
    idempotency_key
  ) VALUES (
    p_evento_id,
    v_evento.asociacion_id,
    p_actor_usuario_id,
    'evento_guardado',
    v_evento.estado,
    v_evento.estado,
    jsonb_build_object('guardado', true),
    v_evento.version_publica,
    'evento:guardar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key)
  ) RETURNING * INTO v_historial;

  RETURN jsonb_build_object(
    'id', v_guardado.id,
    'evento_id', v_guardado.evento_id,
    'guardado', true,
    'event_id', v_historial.id,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.dejar_de_guardar_evento_asociacion(
  p_evento_id uuid,
  p_actor_usuario_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_evento public.eventos_asociacion%ROWTYPE;
  v_guardado public.eventos_guardados%ROWTYPE;
  v_historial public.historial_evento%ROWTYPE;
BEGIN
  IF p_evento_id IS NULL OR p_actor_usuario_id IS NULL
     OR length(trim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'retiro_guardado_evento_incompleto'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_evento
  FROM public.eventos_asociacion
  WHERE id = p_evento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'evento_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_historial
  FROM public.historial_evento
  WHERE asociacion_id = v_evento.asociacion_id
    AND idempotency_key =
      'evento:desguardar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_historial.evento_id IS DISTINCT FROM p_evento_id THEN
      RAISE EXCEPTION 'idempotency_key_retiro_guardado_evento_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
      'evento_id', p_evento_id,
      'guardado', false,
      'event_id', v_historial.id,
      'reintento', true
    );
  END IF;

  SELECT * INTO v_guardado
  FROM public.eventos_guardados
  WHERE evento_id = p_evento_id
    AND usuario_id = p_actor_usuario_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'evento_no_estaba_guardado' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.eventos_guardados
  WHERE id = v_guardado.id;

  INSERT INTO public.historial_evento (
    evento_id,
    asociacion_id,
    actor_usuario_id,
    tipo_evento,
    estado_anterior,
    estado_nuevo,
    datos_extra,
    version_publica,
    idempotency_key
  ) VALUES (
    p_evento_id,
    v_evento.asociacion_id,
    p_actor_usuario_id,
    'evento_dejado_de_guardar',
    v_evento.estado,
    v_evento.estado,
    jsonb_build_object('guardado', false),
    v_evento.version_publica,
    'evento:desguardar:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key)
  ) RETURNING * INTO v_historial;

  RETURN jsonb_build_object(
    'evento_id', p_evento_id,
    'guardado', false,
    'event_id', v_historial.id,
    'reintento', false
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.validar_payload_evento_asociacion(jsonb),
  public.validar_responsable_operativo_evento(uuid, uuid),
  public.snapshot_publico_evento_asociacion(uuid),
  public.crear_borrador_evento_asociacion(uuid, uuid, jsonb, text),
  public.actualizar_evento_asociacion(uuid, uuid, uuid, jsonb, text),
  public.publicar_evento_asociacion(uuid, uuid, uuid, text),
  public.pausar_evento_asociacion(uuid, uuid, uuid, text, text),
  public.cancelar_evento_asociacion(uuid, uuid, uuid, text, text),
  public.guardar_evento_asociacion(uuid, uuid, text),
  public.dejar_de_guardar_evento_asociacion(uuid, uuid, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.validar_payload_evento_asociacion(jsonb),
  public.validar_responsable_operativo_evento(uuid, uuid),
  public.snapshot_publico_evento_asociacion(uuid),
  public.crear_borrador_evento_asociacion(uuid, uuid, jsonb, text),
  public.actualizar_evento_asociacion(uuid, uuid, uuid, jsonb, text),
  public.publicar_evento_asociacion(uuid, uuid, uuid, text),
  public.pausar_evento_asociacion(uuid, uuid, uuid, text, text),
  public.cancelar_evento_asociacion(uuid, uuid, uuid, text, text),
  public.guardar_evento_asociacion(uuid, uuid, text),
  public.dejar_de_guardar_evento_asociacion(uuid, uuid, text)
TO service_role;

COMMENT ON FUNCTION public.crear_borrador_evento_asociacion(
  uuid, uuid, jsonb, text
) IS
  'Crea un borrador privado de una asociacion operativa con idempotencia.';

COMMENT ON FUNCTION public.actualizar_evento_asociacion(
  uuid, uuid, uuid, jsonb, text
) IS
  'Edita un evento propio y versiona cambios posteriores a la primera publicacion.';

COMMENT ON FUNCTION public.publicar_evento_asociacion(
  uuid, uuid, uuid, text
) IS
  'Publica o reanuda un evento despues de validar asociacion, vigencia y datos publicables.';

COMMENT ON FUNCTION public.cancelar_evento_asociacion(
  uuid, uuid, uuid, text, text
) IS
  'Cancela sin eliminar y encola avisos idempotentes para usuarios suscritos.';

COMMENT ON FUNCTION public.guardar_evento_asociacion(uuid, uuid, text) IS
  'Guarda un evento para recibir cambios; no reserva cupo ni registra asistencia.';

COMMIT;

NOTIFY pgrst, 'reload schema';
