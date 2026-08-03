-- Completa la revisión manual y permite que la coordinadora intervenga aun
-- cuando una asociación regional tenga una reserva vigente.

BEGIN;

ALTER TABLE public.validaciones_seguimiento
  ADD COLUMN IF NOT EXISTS mismo_animal boolean,
  ADD COLUMN IF NOT EXISTS foto_clara boolean,
  ADD COLUMN IF NOT EXISTS entorno_adecuado boolean,
  ADD COLUMN IF NOT EXISTS condicion_evolucion text
    CHECK (condicion_evolucion IN ('mejor', 'igual', 'peor', 'no_determinable')),
  ADD COLUMN IF NOT EXISTS posibles_inconsistencias boolean NOT NULL DEFAULT false;

ALTER TABLE public.aclaraciones_seguimiento
  ADD COLUMN IF NOT EXISTS revision_manual jsonb;

DROP FUNCTION IF EXISTS public.reservar_revision_seguimiento(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.reservar_revision_seguimiento(
  p_seguimiento_id uuid,
  p_asociacion_id uuid,
  p_usuario_id uuid,
  p_es_coordinadora boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_revision public.revisiones_seguimiento%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.seguimientos_resguardo
  WHERE id = p_seguimiento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seguimiento_no_encontrado' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_revision FROM public.revisiones_seguimiento
  WHERE seguimiento_id = p_seguimiento_id FOR UPDATE;

  IF FOUND AND v_revision.estado = 'reservada' AND v_revision.vence_at > now()
     AND v_revision.asociacion_id <> p_asociacion_id AND NOT p_es_coordinadora THEN
    RAISE EXCEPTION 'revision_reservada' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.revisiones_seguimiento (
    seguimiento_id, asociacion_id, usuario_id, estado, reservada_at, vence_at
  ) VALUES (
    p_seguimiento_id, p_asociacion_id, p_usuario_id,
    'reservada', now(), now() + interval '30 minutes'
  )
  ON CONFLICT (seguimiento_id) DO UPDATE SET
    asociacion_id = EXCLUDED.asociacion_id,
    usuario_id = EXCLUDED.usuario_id,
    estado = 'reservada', reservada_at = now(),
    vence_at = now() + interval '30 minutes', completada_at = NULL
  RETURNING * INTO v_revision;

  RETURN jsonb_build_object('revision_id', v_revision.id, 'vence_at', v_revision.vence_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.reservar_revision_seguimiento(uuid, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_revision_seguimiento(uuid, uuid, uuid, boolean)
  TO service_role;

COMMIT;
