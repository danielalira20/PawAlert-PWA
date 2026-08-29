-- Infraestructura compartida para las operaciones de adopciones y eventos:
-- autorizacion central, referencias del outbox y claims de jobs. No cambia
-- estados de perfiles, solicitudes, entregas, seguimientos ni eventos.

BEGIN;

ALTER TABLE public.notificaciones_push
  ADD COLUMN IF NOT EXISTS perfil_adopcion_id uuid
    REFERENCES public.perfiles_adopcion(id) ON DELETE SET NULL;

ALTER TABLE public.notificaciones_push
  ADD COLUMN IF NOT EXISTS evento_id uuid
    REFERENCES public.eventos_asociacion(id) ON DELETE SET NULL;

ALTER TABLE public.notificaciones_push
  DROP CONSTRAINT IF EXISTS notificaciones_push_payload_objeto;

ALTER TABLE public.notificaciones_push
  ADD CONSTRAINT notificaciones_push_payload_objeto CHECK (
    jsonb_typeof(payload) = 'object'
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS notificaciones_push_perfil_adopcion_idx
  ON public.notificaciones_push(perfil_adopcion_id, created_at DESC)
  WHERE perfil_adopcion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notificaciones_push_evento_idx
  ON public.notificaciones_push(evento_id, created_at DESC)
  WHERE evento_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.operaciones_modulo_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_job text NOT NULL CHECK (tipo_job IN (
    'seguimientos_adopcion',
    'alertas_bienestar_adopcion',
    'ciclo_vida_eventos'
  )),
  iniciado_at timestamptz NOT NULL DEFAULT now(),
  finalizado_at timestamptz,
  duracion_ms integer CHECK (duracion_ms IS NULL OR duracion_ms >= 0),
  examinados integer NOT NULL DEFAULT 0 CHECK (examinados >= 0),
  actualizados integer NOT NULL DEFAULT 0 CHECK (actualizados >= 0),
  notificaciones_encoladas integer NOT NULL DEFAULT 0 CHECK (
    notificaciones_encoladas >= 0
  ),
  fallidos integer NOT NULL DEFAULT 0 CHECK (fallidos >= 0),
  omitidos integer NOT NULL DEFAULT 0 CHECK (omitidos >= 0),
  estado text NOT NULL DEFAULT 'en_progreso' CHECK (
    estado IN ('en_progreso', 'completado', 'error')
  ),
  resumen_error text,
  CONSTRAINT operaciones_modulo_runs_cierre_consistente CHECK (
    (
      estado = 'en_progreso'
      AND finalizado_at IS NULL
      AND duracion_ms IS NULL
    )
    OR (
      estado IN ('completado', 'error')
      AND finalizado_at IS NOT NULL
      AND duracion_ms IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS operaciones_modulo_runs_tipo_fecha_idx
  ON public.operaciones_modulo_runs(tipo_job, iniciado_at DESC);

CREATE TABLE IF NOT EXISTS public.seguimientos_adopcion_claims (
  seguimiento_adopcion_id uuid PRIMARY KEY
    REFERENCES public.seguimientos_adopcion(id) ON DELETE CASCADE,
  run_id uuid NOT NULL
    REFERENCES public.operaciones_modulo_runs(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT seguimientos_adopcion_claims_vigencia CHECK (
    expires_at > claimed_at
  )
);

CREATE INDEX IF NOT EXISTS seguimientos_adopcion_claims_expira_idx
  ON public.seguimientos_adopcion_claims(expires_at);

CREATE TABLE IF NOT EXISTS public.alertas_bienestar_adopcion_claims (
  alerta_bienestar_adopcion_id uuid PRIMARY KEY
    REFERENCES public.alertas_bienestar_adopcion(id) ON DELETE CASCADE,
  run_id uuid NOT NULL
    REFERENCES public.operaciones_modulo_runs(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT alertas_bienestar_adopcion_claims_vigencia CHECK (
    expires_at > claimed_at
  )
);

CREATE INDEX IF NOT EXISTS alertas_bienestar_adopcion_claims_expira_idx
  ON public.alertas_bienestar_adopcion_claims(expires_at);

CREATE TABLE IF NOT EXISTS public.eventos_asociacion_claims (
  evento_id uuid PRIMARY KEY
    REFERENCES public.eventos_asociacion(id) ON DELETE CASCADE,
  run_id uuid NOT NULL
    REFERENCES public.operaciones_modulo_runs(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT eventos_asociacion_claims_vigencia CHECK (
    expires_at > claimed_at
  )
);

CREATE INDEX IF NOT EXISTS eventos_asociacion_claims_expira_idx
  ON public.eventos_asociacion_claims(expires_at);

CREATE OR REPLACE FUNCTION public.validar_actor_asociacion_operativa(
  p_actor_usuario_id uuid,
  p_asociacion_id uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol text;
  v_asociacion_usuario_id uuid;
  v_verificada boolean;
  v_activa boolean;
BEGIN
  IF p_actor_usuario_id IS NULL OR p_asociacion_id IS NULL THEN
    RAISE EXCEPTION 'actor_o_asociacion_requeridos'
      USING ERRCODE = '22023';
  END IF;

  SELECT rol.nombre, usuario.asociacion_id
  INTO v_rol, v_asociacion_usuario_id
  FROM public.usuarios usuario
  LEFT JOIN public.roles rol ON rol.id = usuario.rol_id
  WHERE usuario.id = p_actor_usuario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'actor_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_rol IS NULL
     OR v_rol NOT IN ('asociacion', 'staff')
     OR v_asociacion_usuario_id IS DISTINCT FROM p_asociacion_id THEN
    RAISE EXCEPTION 'actor_no_pertenece_asociacion'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(verificado, false), COALESCE(activo, false)
  INTO v_verificada, v_activa
  FROM public.asociaciones
  WHERE id = p_asociacion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'asociacion_no_encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_verificada = false OR v_activa = false THEN
    RAISE EXCEPTION 'asociacion_no_operativa' USING ERRCODE = '42501';
  END IF;

  RETURN v_rol;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_actor_administrador(
  p_actor_usuario_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_es_admin boolean;
BEGIN
  IF p_actor_usuario_id IS NULL THEN
    RAISE EXCEPTION 'actor_requerido' USING ERRCODE = '22023';
  END IF;

  SELECT rol.nombre = 'admin'
  INTO v_es_admin
  FROM public.usuarios usuario
  JOIN public.roles rol ON rol.id = usuario.rol_id
  WHERE usuario.id = p_actor_usuario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'actor_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(v_es_admin, false) = false THEN
    RAISE EXCEPTION 'actor_no_es_administrador'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.encolar_notificacion_modulo(
  p_usuario_id uuid,
  p_tipo_evento text,
  p_idempotency_key text,
  p_payload jsonb DEFAULT '{}'::jsonb,
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
  v_existente_tipo_evento text;
  v_existente_payload jsonb;
  v_existente_perfil_id uuid;
  v_existente_evento_id uuid;
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

  IF (p_perfil_adopcion_id IS NOT NULL)::integer
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
    perfil_adopcion_id,
    evento_id,
    tipo_evento,
    payload,
    idempotency_key
  ) VALUES (
    p_usuario_id,
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
    SELECT
      id,
      tipo_evento,
      payload,
      perfil_adopcion_id,
      evento_id
    INTO
      v_notificacion_id,
      v_existente_tipo_evento,
      v_existente_payload,
      v_existente_perfil_id,
      v_existente_evento_id
    FROM public.notificaciones_push
    WHERE usuario_id = p_usuario_id
      AND idempotency_key = trim(p_idempotency_key);

    IF v_notificacion_id IS NULL THEN
      RAISE EXCEPTION 'notificacion_idempotente_no_recuperable'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_existente_tipo_evento IS DISTINCT FROM trim(p_tipo_evento)
       OR v_existente_payload IS DISTINCT FROM p_payload
       OR v_existente_perfil_id IS DISTINCT FROM p_perfil_adopcion_id
       OR v_existente_evento_id IS DISTINCT FROM p_evento_id THEN
      RAISE EXCEPTION 'notificacion_idempotency_key_en_conflicto'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'notificacion_id', v_notificacion_id,
    'insertada', v_insertada
  );
END;
$$;

ALTER TABLE public.operaciones_modulo_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguimientos_adopcion_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas_bienestar_adopcion_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_asociacion_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.operaciones_modulo_runs,
  public.seguimientos_adopcion_claims,
  public.alertas_bienestar_adopcion_claims,
  public.eventos_asociacion_claims
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  public.operaciones_modulo_runs,
  public.seguimientos_adopcion_claims,
  public.alertas_bienestar_adopcion_claims,
  public.eventos_asociacion_claims
TO service_role;

REVOKE ALL ON FUNCTION
  public.validar_actor_asociacion_operativa(uuid, uuid),
  public.validar_actor_administrador(uuid),
  public.encolar_notificacion_modulo(uuid, text, text, jsonb, uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.validar_actor_asociacion_operativa(uuid, uuid),
  public.validar_actor_administrador(uuid),
  public.encolar_notificacion_modulo(uuid, text, text, jsonb, uuid, uuid)
TO service_role;

COMMENT ON FUNCTION public.validar_actor_asociacion_operativa(uuid, uuid) IS
  'Valida rol, pertenencia y que la asociacion conserve verificacion y actividad.';
COMMENT ON FUNCTION public.encolar_notificacion_modulo(uuid, text, text, jsonb, uuid, uuid) IS
  'Encola una notificacion idempotente de adopcion o evento sin datos privados conocidos.';

COMMIT;

NOTIFY pgrst, 'reload schema';
