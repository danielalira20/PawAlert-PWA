-- Una sola asociación revisa cada evidencia durante una ventana breve.
-- La comparación permanece humana y no consume servicios de visión.

BEGIN;

CREATE TABLE IF NOT EXISTS public.revisiones_seguimiento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seguimiento_id uuid NOT NULL UNIQUE
    REFERENCES public.seguimientos_resguardo(id) ON DELETE CASCADE,
  asociacion_id uuid NOT NULL REFERENCES public.asociaciones(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'reservada'
    CHECK (estado IN ('reservada', 'completada', 'liberada')),
  reservada_at timestamptz NOT NULL DEFAULT now(),
  vence_at timestamptz NOT NULL,
  completada_at timestamptz
);

CREATE INDEX IF NOT EXISTS revisiones_seguimiento_asociacion_idx
  ON public.revisiones_seguimiento(asociacion_id, estado, vence_at);

CREATE OR REPLACE FUNCTION public.reservar_revision_seguimiento(
  p_seguimiento_id uuid,
  p_asociacion_id uuid,
  p_usuario_id uuid
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

  SELECT * INTO v_revision
  FROM public.revisiones_seguimiento
  WHERE seguimiento_id = p_seguimiento_id
  FOR UPDATE;

  IF FOUND
     AND v_revision.estado = 'reservada'
     AND v_revision.vence_at > now()
     AND v_revision.asociacion_id <> p_asociacion_id THEN
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
    estado = 'reservada',
    reservada_at = now(),
    vence_at = now() + interval '30 minutes',
    completada_at = NULL
  RETURNING * INTO v_revision;

  RETURN jsonb_build_object(
    'revision_id', v_revision.id,
    'vence_at', v_revision.vence_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reservar_revision_seguimiento(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_revision_seguimiento(uuid, uuid, uuid)
  TO service_role;

COMMIT;
