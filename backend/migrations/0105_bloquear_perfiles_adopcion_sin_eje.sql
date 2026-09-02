-- Bloquea crear perfiles de adopción nuevos cuando la asociación apagó
-- el eje de adopciones (participa_adopciones, de la 0103).
--
-- Se agrega un helper propio (validar_asociacion_participa_adopciones) en
-- vez de tocar validar_actor_asociacion_operativa: ese helper compartido
-- también lo usan publicar/pausar perfiles, resolver solicitudes de
-- ingreso, evaluar solicitudes de adopción y todo el módulo de eventos
-- (0090/0091/0092/0093/0096/0097/0099) -- agregarle el chequeo ahí
-- bloquearía por accidente cosas que ya están en curso y un módulo sin
-- relación (eventos). El mismo criterio que ya usamos en la 0104 para
-- rescates: lo que ya está en marcha sigue su curso, solo se bloquea la
-- entrada de trabajo nuevo -- aquí, publicar un perfil de adopción nuevo.
--
-- Solo se llama desde crear_perfil_adopcion_formal.

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_asociacion_participa_adopciones(
  p_asociacion_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_participa boolean;
BEGIN
  SELECT participa_adopciones INTO v_participa
  FROM public.asociaciones
  WHERE id = p_asociacion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'asociacion_no_encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(v_participa, false) = false THEN
    RAISE EXCEPTION 'asociacion_eje_adopciones_inactivo' USING ERRCODE = '42501';
  END IF;
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

  PERFORM public.validar_asociacion_participa_adopciones(p_asociacion_id);

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

NOTIFY pgrst, 'reload schema';

COMMIT;
