-- Operaciones atomicas para ingreso y publicacion de adopciones. Estas
-- funciones validan autoridad, estado e idempotencia en base de datos; no
-- modifican reportes, custodias ni el flujo de rescate.

BEGIN;

ALTER TABLE public.solicitudes_ingreso_adopcion
  ADD COLUMN IF NOT EXISTS respuesta_informacion text;

CREATE OR REPLACE FUNCTION public.paths_ingreso_adopcion_validos(
  p_paths text[]
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
  SELECT cardinality(p_paths) BETWEEN 1 AND 5
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(p_paths) AS foto_path
      WHERE foto_path IS NULL
         OR foto_path NOT LIKE 'adopciones/ingresos/%'
         OR foto_path ~ '(^|/)\.\.(/|$)'
    );
$$;

ALTER TABLE public.solicitudes_ingreso_adopcion
  DROP CONSTRAINT IF EXISTS solicitudes_ingreso_adopcion_fotos_paths_privados;

ALTER TABLE public.solicitudes_ingreso_adopcion
  ADD CONSTRAINT solicitudes_ingreso_adopcion_fotos_paths_privados CHECK (
    public.paths_ingreso_adopcion_validos(fotos_propuesta_paths)
  ) NOT VALID;

ALTER TABLE public.perfiles_adopcion
  ADD COLUMN IF NOT EXISTS requisitos_base_version text,
  ADD COLUMN IF NOT EXISTS plantilla_requisitos_id uuid,
  ADD COLUMN IF NOT EXISTS plantilla_version integer,
  ADD COLUMN IF NOT EXISTS revision_medica_confirmada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revision_juridica_confirmada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revision_publicacion_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revision_publicacion_at timestamptz;

ALTER TABLE public.perfiles_adopcion
  DROP CONSTRAINT IF EXISTS perfiles_adopcion_plantilla_contexto_fkey;

ALTER TABLE public.perfiles_adopcion
  ADD CONSTRAINT perfiles_adopcion_plantilla_contexto_fkey
  FOREIGN KEY (plantilla_requisitos_id, asociacion_id, plantilla_version)
  REFERENCES public.plantillas_requisitos_adopcion(id, asociacion_id, version)
  ON DELETE RESTRICT;

ALTER TABLE public.perfiles_adopcion
  DROP CONSTRAINT IF EXISTS perfiles_adopcion_requisitos_consistentes;

ALTER TABLE public.perfiles_adopcion
  ADD CONSTRAINT perfiles_adopcion_requisitos_consistentes CHECK (
    (
      plantilla_requisitos_id IS NULL
      AND plantilla_version IS NULL
    ) OR (
      plantilla_requisitos_id IS NOT NULL
      AND plantilla_version IS NOT NULL
    )
  ) NOT VALID;

ALTER TABLE public.perfiles_adopcion
  DROP CONSTRAINT IF EXISTS perfiles_adopcion_revision_publicacion_consistente;

ALTER TABLE public.perfiles_adopcion
  ADD CONSTRAINT perfiles_adopcion_revision_publicacion_consistente CHECK (
    estado NOT IN ('publicado', 'pausado', 'en_proceso', 'adoptado')
    OR (
      revision_medica_confirmada = true
      AND revision_juridica_confirmada = true
      AND revision_publicacion_por_usuario_id IS NOT NULL
      AND revision_publicacion_at IS NOT NULL
      AND NULLIF(trim(requisitos_base_version), '') IS NOT NULL
    )
  ) NOT VALID;

ALTER TABLE public.notificaciones_push
  ADD COLUMN IF NOT EXISTS solicitud_ingreso_adopcion_id uuid
    REFERENCES public.solicitudes_ingreso_adopcion(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS notificaciones_push_ingreso_adopcion_idx
  ON public.notificaciones_push(
    solicitud_ingreso_adopcion_id, created_at DESC
  )
  WHERE solicitud_ingreso_adopcion_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.encolar_notificacion_modulo(
  uuid, text, text, jsonb, uuid, uuid
);

CREATE FUNCTION public.encolar_notificacion_modulo(
  p_usuario_id uuid,
  p_tipo_evento text,
  p_idempotency_key text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_solicitud_ingreso_id uuid DEFAULT NULL,
  p_perfil_adopcion_id uuid DEFAULT NULL,
  p_evento_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_notificacion_id uuid;
  v_insertada boolean := false;
  v_existente public.notificaciones_push%ROWTYPE;
BEGIN
  IF p_usuario_id IS NULL
     OR NULLIF(trim(p_tipo_evento), '') IS NULL
     OR NULLIF(trim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'notificacion_modulo_incompleta'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'payload_notificacion_invalido'
      USING ERRCODE = '22023';
  END IF;

  IF (p_solicitud_ingreso_id IS NOT NULL)::integer
     + (p_perfil_adopcion_id IS NOT NULL)::integer
     + (p_evento_id IS NOT NULL)::integer <> 1 THEN
    RAISE EXCEPTION 'notificacion_modulo_entidad_invalida'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload ?| ARRAY[
    'documento_storage_path',
    'evidencia_storage_path',
    'acuerdo_storage_path',
    'lugar_privado',
    'instrucciones_privadas',
    'motivo_rechazo_interno'
  ] THEN
    RAISE EXCEPTION 'payload_notificacion_contiene_datos_privados'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.notificaciones_push (
    usuario_id,
    solicitud_ingreso_adopcion_id,
    perfil_adopcion_id,
    evento_id,
    tipo_evento,
    payload,
    idempotency_key
  ) VALUES (
    p_usuario_id,
    p_solicitud_ingreso_id,
    p_perfil_adopcion_id,
    p_evento_id,
    trim(p_tipo_evento),
    p_payload,
    trim(p_idempotency_key)
  )
  ON CONFLICT (usuario_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_notificacion_id;

  IF v_notificacion_id IS NOT NULL THEN
    v_insertada := true;
  ELSE
    SELECT * INTO v_existente
    FROM public.notificaciones_push
    WHERE usuario_id = p_usuario_id
      AND idempotency_key = trim(p_idempotency_key);

    IF NOT FOUND THEN
      RAISE EXCEPTION 'notificacion_idempotente_no_recuperable'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_existente.tipo_evento IS DISTINCT FROM trim(p_tipo_evento)
       OR v_existente.payload IS DISTINCT FROM p_payload
       OR v_existente.solicitud_ingreso_adopcion_id
          IS DISTINCT FROM p_solicitud_ingreso_id
       OR v_existente.perfil_adopcion_id
          IS DISTINCT FROM p_perfil_adopcion_id
       OR v_existente.evento_id IS DISTINCT FROM p_evento_id THEN
      RAISE EXCEPTION 'notificacion_idempotency_key_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    v_notificacion_id := v_existente.id;
  END IF;

  RETURN jsonb_build_object(
    'notificacion_id', v_notificacion_id,
    'insertada', v_insertada
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.proponer_ingreso_adopcion_desde_custodia(
  p_custodia_id uuid,
  p_animal_id uuid,
  p_origen_individuo smallint,
  p_actor_usuario_id uuid,
  p_nombre_temporal text,
  p_fotos_propuesta_paths text[],
  p_salud_conocida text,
  p_tratamientos_conocidos text,
  p_temperamento_observado text,
  p_compatibilidad_observada jsonb,
  p_motivo_propuesta text,
  p_custodia_disponible_hasta timestamptz,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_custodia public.custodias_temporales%ROWTYPE;
  v_animal public.animal%ROWTYPE;
  v_usuario_custodio_id uuid;
  v_solicitud public.solicitudes_ingreso_adopcion%ROWTYPE;
  v_evento_id uuid;
  v_usuario_asociacion record;
BEGIN
  IF p_custodia_id IS NULL OR p_animal_id IS NULL
     OR p_actor_usuario_id IS NULL OR p_origen_individuo IS NULL
     OR NULLIF(trim(p_salud_conocida), '') IS NULL
     OR NULLIF(trim(p_temperamento_observado), '') IS NULL
     OR NULLIF(trim(p_motivo_propuesta), '') IS NULL
     OR NULLIF(trim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'propuesta_ingreso_incompleta' USING ERRCODE = '22023';
  END IF;

  IF p_compatibilidad_observada IS NULL
     OR jsonb_typeof(p_compatibilidad_observada) <> 'object' THEN
    RAISE EXCEPTION 'compatibilidad_observada_invalida'
      USING ERRCODE = '22023';
  END IF;

  IF p_fotos_propuesta_paths IS NULL
     OR NOT public.paths_ingreso_adopcion_validos(p_fotos_propuesta_paths) THEN
    RAISE EXCEPTION 'fotos_propuesta_invalidas' USING ERRCODE = '22023';
  END IF;

  SELECT solicitud.* INTO v_solicitud
  FROM public.solicitudes_ingreso_adopcion solicitud
  WHERE solicitud.propuesto_por_usuario_id = p_actor_usuario_id
    AND solicitud.idempotency_key = trim(p_idempotency_key);

  IF FOUND THEN
    IF v_solicitud.custodia_id IS DISTINCT FROM p_custodia_id
       OR v_solicitud.animal_id IS DISTINCT FROM p_animal_id
       OR v_solicitud.origen_individuo IS DISTINCT FROM p_origen_individuo
       OR v_solicitud.nombre_temporal
          IS DISTINCT FROM NULLIF(trim(p_nombre_temporal), '')
       OR v_solicitud.fotos_propuesta_paths IS DISTINCT FROM p_fotos_propuesta_paths
       OR v_solicitud.salud_conocida IS DISTINCT FROM trim(p_salud_conocida)
       OR v_solicitud.tratamientos_conocidos
          IS DISTINCT FROM NULLIF(trim(p_tratamientos_conocidos), '')
       OR v_solicitud.temperamento_observado
          IS DISTINCT FROM trim(p_temperamento_observado)
       OR v_solicitud.compatibilidad_observada
          IS DISTINCT FROM p_compatibilidad_observada
       OR v_solicitud.motivo_propuesta
          IS DISTINCT FROM trim(p_motivo_propuesta)
       OR v_solicitud.custodia_disponible_hasta
          IS DISTINCT FROM p_custodia_disponible_hasta THEN
      RAISE EXCEPTION 'idempotency_key_ingreso_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT id INTO v_evento_id
    FROM public.historial_adopcion
    WHERE solicitud_ingreso_id = v_solicitud.id
      AND tipo_evento = 'adopcion_ingreso_propuesto'
    ORDER BY creado_at
    LIMIT 1;

    RETURN jsonb_build_object(
      'id', v_solicitud.id,
      'estado', v_solicitud.estado,
      'updated_at', v_solicitud.actualizada_at,
      'event_id', v_evento_id,
      'reintento', true
    );
  END IF;

  SELECT custodia.*
  INTO v_custodia
  FROM public.custodias_temporales custodia
  WHERE custodia.id = p_custodia_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'custodia_no_encontrada' USING ERRCODE = 'P0002';
  END IF;

  SELECT voluntario.usuario_id
  INTO v_usuario_custodio_id
  FROM public.voluntarios voluntario
  WHERE voluntario.id = v_custodia.voluntario_id;

  IF v_usuario_custodio_id IS DISTINCT FROM p_actor_usuario_id THEN
    RAISE EXCEPTION 'actor_no_es_custodio_activo' USING ERRCODE = '42501';
  END IF;

  IF v_custodia.estado NOT IN ('activo', 'extension_pendiente') THEN
    RAISE EXCEPTION 'custodia_no_admite_propuesta_adopcion'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.asociaciones asociacion
    WHERE asociacion.id = v_custodia.asociacion_coordinadora_id
      AND COALESCE(asociacion.verificado, false) = true
      AND COALESCE(asociacion.activo, false) = true
  ) THEN
    RAISE EXCEPTION 'asociacion_coordinadora_no_operativa'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_animal
  FROM public.animal
  WHERE id = p_animal_id
    AND reporte_id = v_custodia.reporte_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'animal_no_pertenece_custodia' USING ERRCODE = 'P0002';
  END IF;

  IF (v_animal.es_grupo = true AND (
        p_origen_individuo < 1 OR p_origen_individuo > v_animal.cantidad
      )) OR (v_animal.es_grupo = false AND p_origen_individuo <> 1) THEN
    RAISE EXCEPTION 'individuo_animal_invalido' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.resultados_rescate_animal resultado
    WHERE resultado.animal_id = p_animal_id
      AND resultado.estado IN ('sin_vida_reportado', 'sin_vida_confirmado')
  ) THEN
    RAISE EXCEPTION 'animal_con_resultado_incompatible_adopcion'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.perfiles_adopcion perfil
    WHERE perfil.animal_id = p_animal_id
      AND perfil.origen_individuo = p_origen_individuo
      AND perfil.estado NOT IN ('adoptado', 'retirado', 'fallecido')
  ) THEN
    RAISE EXCEPTION 'animal_ya_tiene_perfil_adopcion_activo'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_custodia_disponible_hasta IS NOT NULL
     AND p_custodia_disponible_hasta <= now() THEN
    RAISE EXCEPTION 'fecha_disponibilidad_custodia_invalida'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.solicitudes_ingreso_adopcion (
    origen,
    asociacion_id,
    custodia_id,
    reporte_id,
    animal_id,
    origen_individuo,
    propuesto_por_usuario_id,
    nombre_temporal,
    fotos_propuesta_paths,
    salud_conocida,
    tratamientos_conocidos,
    temperamento_observado,
    compatibilidad_observada,
    motivo_propuesta,
    custodia_disponible_hasta,
    idempotency_key
  ) VALUES (
    'custodia_pawalert',
    v_custodia.asociacion_coordinadora_id,
    v_custodia.id,
    v_custodia.reporte_id,
    p_animal_id,
    p_origen_individuo,
    p_actor_usuario_id,
    NULLIF(trim(p_nombre_temporal), ''),
    p_fotos_propuesta_paths,
    trim(p_salud_conocida),
    NULLIF(trim(p_tratamientos_conocidos), ''),
    trim(p_temperamento_observado),
    p_compatibilidad_observada,
    trim(p_motivo_propuesta),
    p_custodia_disponible_hasta,
    trim(p_idempotency_key)
  ) RETURNING * INTO v_solicitud;

  INSERT INTO public.historial_adopcion (
    asociacion_id,
    solicitud_ingreso_id,
    actor_usuario_id,
    tipo_evento,
    estado_nuevo,
    datos_extra,
    idempotency_key
  ) VALUES (
    v_solicitud.asociacion_id,
    v_solicitud.id,
    p_actor_usuario_id,
    'adopcion_ingreso_propuesto',
    'pendiente',
    jsonb_build_object(
      'origen', 'custodia_pawalert',
      'animal_id', p_animal_id,
      'origen_individuo', p_origen_individuo
    ),
    'ingreso:proponer:' || p_actor_usuario_id::text || ':'
      || trim(p_idempotency_key)
  ) RETURNING id INTO v_evento_id;

  FOR v_usuario_asociacion IN
    SELECT usuario.id
    FROM public.usuarios usuario
    JOIN public.roles rol ON rol.id = usuario.rol_id
    WHERE usuario.asociacion_id = v_solicitud.asociacion_id
      AND rol.nombre IN ('asociacion', 'staff')
  LOOP
    PERFORM public.encolar_notificacion_modulo(
      v_usuario_asociacion.id,
      'adopcion_ingreso_propuesto',
      'adopcion:ingreso:propuesto:' || v_solicitud.id::text,
      jsonb_build_object(
        'solicitud_ingreso_id', v_solicitud.id,
        'estado', v_solicitud.estado
      ),
      v_solicitud.id,
      NULL,
      NULL
    );
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_solicitud.id,
    'estado', v_solicitud.estado,
    'updated_at', v_solicitud.actualizada_at,
    'event_id', v_evento_id,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.responder_aclaracion_ingreso_adopcion(
  p_solicitud_id uuid,
  p_actor_usuario_id uuid,
  p_respuesta text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_solicitud public.solicitudes_ingreso_adopcion%ROWTYPE;
  v_evento public.historial_adopcion%ROWTYPE;
  v_usuario_asociacion record;
BEGIN
  IF p_solicitud_id IS NULL OR p_actor_usuario_id IS NULL
     OR NULLIF(trim(p_respuesta), '') IS NULL
     OR NULLIF(trim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'respuesta_aclaracion_incompleta' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_solicitud
  FROM public.solicitudes_ingreso_adopcion
  WHERE id = p_solicitud_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitud_ingreso_no_encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_solicitud.propuesto_por_usuario_id IS DISTINCT FROM p_actor_usuario_id THEN
    RAISE EXCEPTION 'actor_no_es_proponente_ingreso' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_evento
  FROM public.historial_adopcion
  WHERE asociacion_id = v_solicitud.asociacion_id
    AND idempotency_key = 'ingreso:aclarar:' || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_evento.solicitud_ingreso_id IS DISTINCT FROM p_solicitud_id
       OR v_evento.datos_extra->>'respuesta' IS DISTINCT FROM trim(p_respuesta) THEN
      RAISE EXCEPTION 'idempotency_key_aclaracion_en_conflicto'
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

  IF v_solicitud.estado <> 'requiere_informacion' THEN
    RAISE EXCEPTION 'solicitud_ingreso_no_espera_aclaracion'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.solicitudes_ingreso_adopcion
  SET estado = 'pendiente',
      respuesta_informacion = trim(p_respuesta),
      informacion_respondida_at = now()
  WHERE id = p_solicitud_id
  RETURNING * INTO v_solicitud;

  INSERT INTO public.historial_adopcion (
    asociacion_id,
    solicitud_ingreso_id,
    actor_usuario_id,
    tipo_evento,
    estado_anterior,
    estado_nuevo,
    datos_extra,
    idempotency_key
  ) VALUES (
    v_solicitud.asociacion_id,
    v_solicitud.id,
    p_actor_usuario_id,
    'adopcion_ingreso_aclaracion_respondida',
    'requiere_informacion',
    'pendiente',
    jsonb_build_object('respuesta', trim(p_respuesta)),
    'ingreso:aclarar:' || trim(p_idempotency_key)
  ) RETURNING * INTO v_evento;

  FOR v_usuario_asociacion IN
    SELECT usuario.id
    FROM public.usuarios usuario
    JOIN public.roles rol ON rol.id = usuario.rol_id
    WHERE usuario.asociacion_id = v_solicitud.asociacion_id
      AND rol.nombre IN ('asociacion', 'staff')
  LOOP
    PERFORM public.encolar_notificacion_modulo(
      v_usuario_asociacion.id,
      'adopcion_ingreso_aclaracion_respondida',
      'adopcion:ingreso:aclaracion:' || v_evento.id::text,
      jsonb_build_object(
        'solicitud_ingreso_id', v_solicitud.id,
        'estado', v_solicitud.estado
      ),
      v_solicitud.id,
      NULL,
      NULL
    );
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_solicitud.id,
    'estado', v_solicitud.estado,
    'updated_at', v_solicitud.actualizada_at,
    'event_id', v_evento.id,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_solicitud_ingreso_adopcion(
  p_solicitud_id uuid,
  p_actor_usuario_id uuid,
  p_motivo text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_solicitud public.solicitudes_ingreso_adopcion%ROWTYPE;
  v_evento public.historial_adopcion%ROWTYPE;
  v_estado_anterior text;
  v_usuario_asociacion record;
BEGIN
  IF p_solicitud_id IS NULL OR p_actor_usuario_id IS NULL
     OR NULLIF(trim(p_motivo), '') IS NULL
     OR NULLIF(trim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'cancelacion_ingreso_incompleta' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_solicitud
  FROM public.solicitudes_ingreso_adopcion
  WHERE id = p_solicitud_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitud_ingreso_no_encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_solicitud.propuesto_por_usuario_id IS DISTINCT FROM p_actor_usuario_id THEN
    RAISE EXCEPTION 'actor_no_es_proponente_ingreso' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_evento
  FROM public.historial_adopcion
  WHERE asociacion_id = v_solicitud.asociacion_id
    AND idempotency_key = 'ingreso:cancelar:' || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_evento.solicitud_ingreso_id IS DISTINCT FROM p_solicitud_id
       OR v_evento.motivo IS DISTINCT FROM trim(p_motivo) THEN
      RAISE EXCEPTION 'idempotency_key_cancelacion_en_conflicto'
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

  IF v_solicitud.estado NOT IN ('pendiente', 'requiere_informacion') THEN
    RAISE EXCEPTION 'solicitud_ingreso_terminal' USING ERRCODE = 'P0001';
  END IF;

  v_estado_anterior := v_solicitud.estado;

  UPDATE public.solicitudes_ingreso_adopcion
  SET estado = 'cancelada',
      resuelta_por_usuario_id = p_actor_usuario_id,
      resuelta_at = now(),
      motivo_resolucion = trim(p_motivo)
  WHERE id = p_solicitud_id
  RETURNING * INTO v_solicitud;

  INSERT INTO public.historial_adopcion (
    asociacion_id,
    solicitud_ingreso_id,
    actor_usuario_id,
    tipo_evento,
    estado_anterior,
    estado_nuevo,
    motivo,
    idempotency_key
  ) VALUES (
    v_solicitud.asociacion_id,
    v_solicitud.id,
    p_actor_usuario_id,
    'adopcion_ingreso_cancelado',
    v_estado_anterior,
    'cancelada',
    trim(p_motivo),
    'ingreso:cancelar:' || trim(p_idempotency_key)
  ) RETURNING * INTO v_evento;

  FOR v_usuario_asociacion IN
    SELECT usuario.id
    FROM public.usuarios usuario
    JOIN public.roles rol ON rol.id = usuario.rol_id
    WHERE usuario.asociacion_id = v_solicitud.asociacion_id
      AND rol.nombre IN ('asociacion', 'staff')
  LOOP
    PERFORM public.encolar_notificacion_modulo(
      v_usuario_asociacion.id,
      'adopcion_ingreso_cancelado',
      'adopcion:ingreso:cancelado:' || v_evento.id::text,
      jsonb_build_object(
        'solicitud_ingreso_id', v_solicitud.id,
        'estado', v_solicitud.estado
      ),
      v_solicitud.id,
      NULL,
      NULL
    );
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_solicitud.id,
    'estado', v_solicitud.estado,
    'updated_at', v_solicitud.actualizada_at,
    'event_id', v_evento.id,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolver_solicitud_ingreso_adopcion(
  p_solicitud_id uuid,
  p_asociacion_id uuid,
  p_actor_usuario_id uuid,
  p_decision text,
  p_motivo text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_solicitud public.solicitudes_ingreso_adopcion%ROWTYPE;
  v_animal public.animal%ROWTYPE;
  v_perfil public.perfiles_adopcion%ROWTYPE;
  v_evento public.historial_adopcion%ROWTYPE;
  v_estado_anterior text;
  v_estado_nuevo text;
  v_tipo_evento text;
BEGIN
  IF p_solicitud_id IS NULL OR p_asociacion_id IS NULL
     OR p_actor_usuario_id IS NULL
     OR p_decision IS NULL
     OR p_decision NOT IN (
       'aprobar', 'solicitar_informacion', 'rechazar', 'no_elegible'
     )
     OR NULLIF(trim(p_motivo), '') IS NULL
     OR NULLIF(trim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'resolucion_ingreso_incompleta' USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_asociacion_operativa(
    p_actor_usuario_id, p_asociacion_id
  );

  SELECT * INTO v_solicitud
  FROM public.solicitudes_ingreso_adopcion
  WHERE id = p_solicitud_id
  FOR UPDATE;

  IF NOT FOUND OR v_solicitud.asociacion_id IS DISTINCT FROM p_asociacion_id THEN
    RAISE EXCEPTION 'solicitud_ingreso_no_encontrada' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_evento
  FROM public.historial_adopcion
  WHERE asociacion_id = p_asociacion_id
    AND idempotency_key = 'ingreso:resolver:' || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_evento.solicitud_ingreso_id IS DISTINCT FROM p_solicitud_id
       OR v_evento.datos_extra->>'decision' IS DISTINCT FROM p_decision
       OR v_evento.motivo IS DISTINCT FROM trim(p_motivo) THEN
      RAISE EXCEPTION 'idempotency_key_resolucion_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_perfil
    FROM public.perfiles_adopcion
    WHERE solicitud_ingreso_id = p_solicitud_id;

    RETURN jsonb_build_object(
      'id', v_solicitud.id,
      'estado', v_solicitud.estado,
      'perfil_adopcion_id', v_perfil.id,
      'updated_at', v_solicitud.actualizada_at,
      'event_id', v_evento.id,
      'reintento', true
    );
  END IF;

  IF v_solicitud.estado NOT IN ('pendiente', 'requiere_informacion') THEN
    RAISE EXCEPTION 'solicitud_ingreso_terminal' USING ERRCODE = 'P0001';
  END IF;

  IF p_decision = 'solicitar_informacion'
     AND v_solicitud.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'solicitud_ingreso_ya_espera_aclaracion'
      USING ERRCODE = 'P0001';
  END IF;

  v_estado_anterior := v_solicitud.estado;

  IF p_decision = 'solicitar_informacion' THEN
    UPDATE public.solicitudes_ingreso_adopcion
    SET estado = 'requiere_informacion',
        informacion_solicitada = trim(p_motivo),
        informacion_solicitada_at = now(),
        respuesta_informacion = NULL,
        informacion_respondida_at = NULL
    WHERE id = p_solicitud_id
    RETURNING * INTO v_solicitud;

    v_estado_nuevo := 'requiere_informacion';
    v_tipo_evento := 'adopcion_ingreso_requiere_informacion';
  ELSIF p_decision = 'aprobar' THEN
    IF v_solicitud.animal_id IS NOT NULL THEN
      SELECT * INTO v_animal
      FROM public.animal
      WHERE id = v_solicitud.animal_id
        AND reporte_id = v_solicitud.reporte_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'animal_ingreso_no_encontrado' USING ERRCODE = 'P0002';
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.resultados_rescate_animal resultado
        WHERE resultado.animal_id = v_solicitud.animal_id
          AND resultado.estado IN ('sin_vida_reportado', 'sin_vida_confirmado')
      ) THEN
        RAISE EXCEPTION 'animal_con_resultado_incompatible_adopcion'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    UPDATE public.solicitudes_ingreso_adopcion
    SET estado = 'aprobada',
        resuelta_por_usuario_id = p_actor_usuario_id,
        resuelta_at = now(),
        motivo_resolucion = trim(p_motivo)
    WHERE id = p_solicitud_id
    RETURNING * INTO v_solicitud;

    INSERT INTO public.perfiles_adopcion (
      asociacion_id,
      solicitud_ingreso_id,
      origen,
      custodia_id,
      reporte_id,
      animal_id,
      origen_individuo,
      creado_por_usuario_id,
      nombre_publico,
      tipo_animal_id,
      tipo_animal_otro_id,
      tamanio_id,
      raza_id,
      sexo,
      edad_aproximada,
      descripcion,
      personalidad,
      salud_conocida,
      tratamientos,
      compatibilidad
    ) VALUES (
      v_solicitud.asociacion_id,
      v_solicitud.id,
      v_solicitud.origen,
      v_solicitud.custodia_id,
      v_solicitud.reporte_id,
      v_solicitud.animal_id,
      v_solicitud.origen_individuo,
      p_actor_usuario_id,
      v_solicitud.nombre_temporal,
      v_animal.tipo_animal_id,
      v_animal.tipo_animal_otro_id,
      v_animal.tamanio_id,
      v_animal.raza_id,
      v_animal.sexo,
      v_animal.edad_aproximada,
      v_animal.descripcion,
      v_solicitud.temperamento_observado,
      v_solicitud.salud_conocida,
      v_solicitud.tratamientos_conocidos,
      v_solicitud.compatibilidad_observada
    ) RETURNING * INTO v_perfil;

    v_estado_nuevo := 'aprobada';
    v_tipo_evento := 'adopcion_ingreso_aprobado';
  ELSE
    v_estado_nuevo := CASE p_decision
      WHEN 'rechazar' THEN 'rechazada'
      ELSE 'no_elegible'
    END;
    v_tipo_evento := CASE p_decision
      WHEN 'rechazar' THEN 'adopcion_ingreso_rechazado'
      ELSE 'adopcion_ingreso_no_elegible'
    END;

    UPDATE public.solicitudes_ingreso_adopcion
    SET estado = v_estado_nuevo,
        resuelta_por_usuario_id = p_actor_usuario_id,
        resuelta_at = now(),
        motivo_resolucion = trim(p_motivo)
    WHERE id = p_solicitud_id
    RETURNING * INTO v_solicitud;
  END IF;

  INSERT INTO public.historial_adopcion (
    asociacion_id,
    solicitud_ingreso_id,
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
    v_solicitud.id,
    v_perfil.id,
    p_actor_usuario_id,
    v_tipo_evento,
    v_estado_anterior,
    v_estado_nuevo,
    trim(p_motivo),
    jsonb_build_object('decision', p_decision),
    'ingreso:resolver:' || trim(p_idempotency_key)
  ) RETURNING * INTO v_evento;

  PERFORM public.encolar_notificacion_modulo(
    v_solicitud.propuesto_por_usuario_id,
    v_tipo_evento,
    'adopcion:ingreso:resolucion:' || v_evento.id::text,
    jsonb_build_object(
      'solicitud_ingreso_id', v_solicitud.id,
      'estado', v_solicitud.estado,
      'perfil_adopcion_id', v_perfil.id
    ),
    v_solicitud.id,
    NULL,
    NULL
  );

  RETURN jsonb_build_object(
    'id', v_solicitud.id,
    'estado', v_solicitud.estado,
    'perfil_adopcion_id', v_perfil.id,
    'updated_at', v_solicitud.actualizada_at,
    'event_id', v_evento.id,
    'reintento', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crear_perfil_adopcion_formal(
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
  v_compatibilidad jsonb;
BEGIN
  IF p_asociacion_id IS NULL OR p_actor_usuario_id IS NULL
     OR p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object'
     OR NULLIF(trim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'perfil_formal_incompleto' USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_actor_asociacion_operativa(
    p_actor_usuario_id, p_asociacion_id
  );

  SELECT * INTO v_evento
  FROM public.historial_adopcion
  WHERE asociacion_id = p_asociacion_id
    AND idempotency_key = 'perfil:formal:' || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_evento.datos_extra->'entrada' IS DISTINCT FROM p_datos THEN
      RAISE EXCEPTION 'idempotency_key_perfil_formal_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_perfil
    FROM public.perfiles_adopcion
    WHERE id = v_evento.perfil_adopcion_id;

    RETURN jsonb_build_object(
      'id', v_perfil.id,
      'estado', v_perfil.estado,
      'updated_at', v_perfil.actualizado_at,
      'event_id', v_evento.id,
      'reintento', true
    );
  END IF;

  v_compatibilidad := COALESCE(p_datos->'compatibilidad', '{}'::jsonb);
  IF jsonb_typeof(v_compatibilidad) <> 'object' THEN
    RAISE EXCEPTION 'compatibilidad_perfil_invalida' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.perfiles_adopcion (
    asociacion_id,
    origen,
    creado_por_usuario_id,
    nombre_publico,
    tipo_animal_id,
    tipo_animal_otro_id,
    tamanio_id,
    raza_id,
    sexo,
    edad_aproximada,
    descripcion,
    personalidad,
    salud_conocida,
    tratamientos,
    necesidades_especiales,
    vacunacion_estado,
    esterilizacion_estado,
    revision_medica_estado,
    compatibilidad,
    zona_general
  ) VALUES (
    p_asociacion_id,
    'ingreso_formal_asociacion',
    p_actor_usuario_id,
    NULLIF(trim(p_datos->>'nombre_publico'), ''),
    NULLIF(p_datos->>'tipo_animal_id', '')::uuid,
    NULLIF(p_datos->>'tipo_animal_otro_id', '')::uuid,
    NULLIF(p_datos->>'tamanio_id', '')::uuid,
    NULLIF(p_datos->>'raza_id', '')::uuid,
    NULLIF(trim(p_datos->>'sexo'), ''),
    NULLIF(trim(p_datos->>'edad_aproximada'), ''),
    NULLIF(trim(p_datos->>'descripcion'), ''),
    NULLIF(trim(p_datos->>'personalidad'), ''),
    NULLIF(trim(p_datos->>'salud_conocida'), ''),
    NULLIF(trim(p_datos->>'tratamientos'), ''),
    NULLIF(trim(p_datos->>'necesidades_especiales'), ''),
    COALESCE(NULLIF(trim(p_datos->>'vacunacion_estado'), ''), 'desconocido'),
    COALESCE(NULLIF(trim(p_datos->>'esterilizacion_estado'), ''), 'desconocido'),
    COALESCE(NULLIF(trim(p_datos->>'revision_medica_estado'), ''), 'desconocida'),
    v_compatibilidad,
    NULLIF(trim(p_datos->>'zona_general'), '')
  ) RETURNING * INTO v_perfil;

  INSERT INTO public.historial_adopcion (
    asociacion_id,
    perfil_adopcion_id,
    actor_usuario_id,
    tipo_evento,
    estado_nuevo,
    datos_extra,
    idempotency_key
  ) VALUES (
    p_asociacion_id,
    v_perfil.id,
    p_actor_usuario_id,
    'perfil_adopcion_borrador_creado',
    'borrador',
    jsonb_build_object('entrada', p_datos),
    'perfil:formal:' || trim(p_idempotency_key)
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

CREATE OR REPLACE FUNCTION public.publicar_perfil_adopcion(
  p_perfil_id uuid,
  p_asociacion_id uuid,
  p_actor_usuario_id uuid,
  p_revision_medica_confirmada boolean,
  p_revision_juridica_confirmada boolean,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_perfil public.perfiles_adopcion%ROWTYPE;
  v_evento public.historial_adopcion%ROWTYPE;
  v_estado_anterior text;
  v_plantilla public.plantillas_requisitos_adopcion%ROWTYPE;
BEGIN
  IF p_perfil_id IS NULL OR p_asociacion_id IS NULL
     OR p_actor_usuario_id IS NULL
     OR COALESCE(p_revision_medica_confirmada, false) = false
     OR COALESCE(p_revision_juridica_confirmada, false) = false
     OR NULLIF(trim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'revision_publicacion_incompleta' USING ERRCODE = '22023';
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
    AND idempotency_key = 'perfil:publicar:' || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_evento.perfil_adopcion_id IS DISTINCT FROM p_perfil_id THEN
      RAISE EXCEPTION 'idempotency_key_publicacion_en_conflicto'
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
    RAISE EXCEPTION 'perfil_adopcion_no_publicable' USING ERRCODE = 'P0001';
  END IF;

  IF v_perfil.estado_moderacion <> 'visible' THEN
    RAISE EXCEPTION 'perfil_adopcion_suspendido' USING ERRCODE = 'P0001';
  END IF;

  IF NULLIF(trim(v_perfil.nombre_publico), '') IS NULL
     OR v_perfil.tipo_animal_id IS NULL
     OR v_perfil.tamanio_id IS NULL
     OR NULLIF(trim(v_perfil.sexo), '') IS NULL
     OR NULLIF(trim(v_perfil.edad_aproximada), '') IS NULL
     OR NULLIF(trim(v_perfil.descripcion), '') IS NULL
     OR NULLIF(trim(v_perfil.personalidad), '') IS NULL
     OR NULLIF(trim(v_perfil.salud_conocida), '') IS NULL
     OR NULLIF(trim(v_perfil.zona_general), '') IS NULL
     OR jsonb_typeof(v_perfil.compatibilidad) <> 'object' THEN
    RAISE EXCEPTION 'perfil_adopcion_datos_publicacion_incompletos'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fotos_perfil_adopcion foto
    WHERE foto.perfil_adopcion_id = p_perfil_id
      AND foto.aprobada_publicacion = true
  ) THEN
    RAISE EXCEPTION 'perfil_adopcion_sin_foto_aprobada'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.requisitos_base_adopcion requisito
    WHERE requisito.version = 'pawalert-v1'
      AND requisito.activo = true
  ) THEN
    RAISE EXCEPTION 'requisitos_base_adopcion_no_disponibles'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_plantilla
  FROM public.plantillas_requisitos_adopcion plantilla
  WHERE plantilla.asociacion_id = p_asociacion_id
    AND plantilla.estado = 'activa'
  LIMIT 1;

  v_estado_anterior := v_perfil.estado;

  UPDATE public.perfiles_adopcion
  SET estado = 'publicado',
      requisitos_base_version = 'pawalert-v1',
      plantilla_requisitos_id = v_plantilla.id,
      plantilla_version = v_plantilla.version,
      revision_medica_confirmada = true,
      revision_juridica_confirmada = true,
      revision_publicacion_por_usuario_id = p_actor_usuario_id,
      revision_publicacion_at = now(),
      publicado_at = COALESCE(publicado_at, now()),
      pausado_at = NULL
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
    'perfil_adopcion_publicado',
    v_estado_anterior,
    'publicado',
    jsonb_build_object(
      'requisitos_base_version', v_perfil.requisitos_base_version,
      'plantilla_requisitos_id', v_perfil.plantilla_requisitos_id,
      'plantilla_version', v_perfil.plantilla_version
    ),
    'perfil:publicar:' || trim(p_idempotency_key)
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

CREATE OR REPLACE FUNCTION public.pausar_perfil_adopcion(
  p_perfil_id uuid,
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
  v_evento public.historial_adopcion%ROWTYPE;
BEGIN
  IF p_perfil_id IS NULL OR p_asociacion_id IS NULL
     OR p_actor_usuario_id IS NULL
     OR NULLIF(trim(p_motivo), '') IS NULL
     OR NULLIF(trim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'pausa_perfil_incompleta' USING ERRCODE = '22023';
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
    AND idempotency_key = 'perfil:pausar:' || trim(p_idempotency_key);

  IF FOUND THEN
    IF v_evento.perfil_adopcion_id IS DISTINCT FROM p_perfil_id
       OR v_evento.motivo IS DISTINCT FROM trim(p_motivo) THEN
      RAISE EXCEPTION 'idempotency_key_pausa_en_conflicto'
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

  IF v_perfil.estado <> 'publicado' THEN
    RAISE EXCEPTION 'perfil_adopcion_no_pausable' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.perfiles_adopcion
  SET estado = 'pausado',
      pausado_at = now()
  WHERE id = p_perfil_id
  RETURNING * INTO v_perfil;

  INSERT INTO public.historial_adopcion (
    asociacion_id,
    perfil_adopcion_id,
    actor_usuario_id,
    tipo_evento,
    estado_anterior,
    estado_nuevo,
    motivo,
    idempotency_key
  ) VALUES (
    p_asociacion_id,
    p_perfil_id,
    p_actor_usuario_id,
    'perfil_adopcion_pausado',
    'publicado',
    'pausado',
    trim(p_motivo),
    'perfil:pausar:' || trim(p_idempotency_key)
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

REVOKE ALL ON FUNCTION
  public.paths_ingreso_adopcion_validos(text[]),
  public.encolar_notificacion_modulo(
    uuid, text, text, jsonb, uuid, uuid, uuid
  ),
  public.proponer_ingreso_adopcion_desde_custodia(
    uuid, uuid, smallint, uuid, text, text[], text, text, text,
    jsonb, text, timestamptz, text
  ),
  public.responder_aclaracion_ingreso_adopcion(uuid, uuid, text, text),
  public.cancelar_solicitud_ingreso_adopcion(uuid, uuid, text, text),
  public.resolver_solicitud_ingreso_adopcion(
    uuid, uuid, uuid, text, text, text
  ),
  public.crear_perfil_adopcion_formal(uuid, uuid, jsonb, text),
  public.publicar_perfil_adopcion(
    uuid, uuid, uuid, boolean, boolean, text
  ),
  public.pausar_perfil_adopcion(uuid, uuid, uuid, text, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.paths_ingreso_adopcion_validos(text[]),
  public.encolar_notificacion_modulo(
    uuid, text, text, jsonb, uuid, uuid, uuid
  ),
  public.proponer_ingreso_adopcion_desde_custodia(
    uuid, uuid, smallint, uuid, text, text[], text, text, text,
    jsonb, text, timestamptz, text
  ),
  public.responder_aclaracion_ingreso_adopcion(uuid, uuid, text, text),
  public.cancelar_solicitud_ingreso_adopcion(uuid, uuid, text, text),
  public.resolver_solicitud_ingreso_adopcion(
    uuid, uuid, uuid, text, text, text
  ),
  public.crear_perfil_adopcion_formal(uuid, uuid, jsonb, text),
  public.publicar_perfil_adopcion(
    uuid, uuid, uuid, boolean, boolean, text
  ),
  public.pausar_perfil_adopcion(uuid, uuid, uuid, text, text)
TO service_role;

COMMENT ON FUNCTION public.proponer_ingreso_adopcion_desde_custodia(
  uuid, uuid, smallint, uuid, text, text[], text, text, text,
  jsonb, text, timestamptz, text
) IS
  'Crea una propuesta privada del custodio sin cambiar el reporte ni la custodia.';

COMMENT ON FUNCTION public.resolver_solicitud_ingreso_adopcion(
  uuid, uuid, uuid, text, text, text
) IS
  'Resuelve una propuesta; aprobar crea exactamente un perfil borrador en la misma transaccion.';

COMMENT ON FUNCTION public.publicar_perfil_adopcion(
  uuid, uuid, uuid, boolean, boolean, text
) IS
  'Publica o reanuda un perfil despues de validar datos, foto, revision y requisitos versionados.';

COMMIT;

NOTIFY pgrst, 'reload schema';
