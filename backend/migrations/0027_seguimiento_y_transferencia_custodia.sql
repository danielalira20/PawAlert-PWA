-- Fases 4–6: seguimiento, validación regional y transferencia segura.

BEGIN;

ALTER TABLE public.custodias_temporales
  ADD COLUMN IF NOT EXISTS ultimo_seguimiento_at timestamptz,
  ADD COLUMN IF NOT EXISTS seguimiento_inicial_at timestamptz;

ALTER TABLE public.seguimientos_resguardo
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'periodico'
    CHECK (tipo IN ('inicial', 'periodico', 'extraordinario')),
  ADD COLUMN IF NOT EXISTS proximo_seguimiento_at timestamptz;

ALTER TABLE public.solicitudes_relevo
  ADD COLUMN IF NOT EXISTS asociacion_receptora_id uuid
    REFERENCES public.asociaciones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reservada_at timestamptz,
  ADD COLUMN IF NOT EXISTS radio_actual_km integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS ultima_ampliacion_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalada_admin_at timestamptz;

ALTER TABLE public.transferencias_custodia
  ADD COLUMN IF NOT EXISTS entrega_confirmada_por_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recepcion_confirmada_por_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS foto_recepcion_url text,
  ADD COLUMN IF NOT EXISTS latitud_recepcion numeric,
  ADD COLUMN IF NOT EXISTS longitud_recepcion numeric;

CREATE TABLE IF NOT EXISTS public.notificaciones_custodia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custodia_id uuid NOT NULL REFERENCES public.custodias_temporales(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN (
    'seguimiento_proximo', 'seguimiento_vencido',
    'vencimiento_72h', 'vencimiento_24h', 'relevo_solicitado'
  )),
  mensaje text NOT NULL,
  leida boolean NOT NULL DEFAULT false,
  creada_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (custodia_id, usuario_id, tipo)
);

CREATE INDEX IF NOT EXISTS notificaciones_custodia_usuario_idx
  ON public.notificaciones_custodia(usuario_id, leida, creada_at DESC);

CREATE OR REPLACE FUNCTION public.reservar_relevo_custodia(
  p_solicitud_id uuid,
  p_asociacion_receptora_id uuid,
  p_fecha_programada timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_solicitud public.solicitudes_relevo%ROWTYPE;
  v_custodia public.custodias_temporales%ROWTYPE;
  v_transferencia_id uuid;
BEGIN
  SELECT * INTO v_solicitud
  FROM public.solicitudes_relevo
  WHERE id = p_solicitud_id
  FOR UPDATE;

  IF NOT FOUND OR v_solicitud.estado <> 'abierta' THEN
    RAISE EXCEPTION 'relevo_no_disponible' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_custodia
  FROM public.custodias_temporales
  WHERE id = v_solicitud.custodia_id
  FOR UPDATE;

  IF v_custodia.estado <> 'buscando_relevo'
     OR v_custodia.asociacion_coordinadora_id = p_asociacion_receptora_id THEN
    RAISE EXCEPTION 'relevo_no_disponible' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.solicitudes_relevo
  SET estado = 'reservada',
      asociacion_receptora_id = p_asociacion_receptora_id,
      reservada_at = now()
  WHERE id = p_solicitud_id;

  UPDATE public.custodias_temporales
  SET estado = 'traslado_programado'
  WHERE id = v_custodia.id;

  INSERT INTO public.transferencias_custodia (
    custodia_id, solicitud_relevo_id, asociacion_origen_id,
    asociacion_receptora_id, fecha_programada, estado
  ) VALUES (
    v_custodia.id, p_solicitud_id, v_custodia.asociacion_coordinadora_id,
    p_asociacion_receptora_id, p_fecha_programada, 'programada'
  )
  RETURNING id INTO v_transferencia_id;

  RETURN v_transferencia_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.reservar_relevo_custodia(
  uuid, uuid, timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reservar_relevo_custodia(
  uuid, uuid, timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.confirmar_transferencia_custodia(
  p_transferencia_id uuid,
  p_usuario_id uuid,
  p_modo text,
  p_foto_url text,
  p_latitud numeric,
  p_longitud numeric
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_transferencia public.transferencias_custodia%ROWTYPE;
  v_reporte_id uuid;
BEGIN
  SELECT * INTO v_transferencia
  FROM public.transferencias_custodia
  WHERE id = p_transferencia_id
  FOR UPDATE;

  IF NOT FOUND OR v_transferencia.estado NOT IN ('programada', 'en_curso') THEN
    RAISE EXCEPTION 'transferencia_no_disponible' USING ERRCODE = 'P0001';
  END IF;

  IF p_modo = 'entrega' THEN
    UPDATE public.transferencias_custodia
    SET confirma_entrega_at = COALESCE(confirma_entrega_at, now()),
        entrega_confirmada_por_id = p_usuario_id,
        foto_entrega_url = p_foto_url,
        latitud = p_latitud,
        longitud = p_longitud,
        estado = 'en_curso'
    WHERE id = p_transferencia_id;
  ELSIF p_modo = 'recepcion' THEN
    UPDATE public.transferencias_custodia
    SET confirma_recepcion_at = COALESCE(confirma_recepcion_at, now()),
        recepcion_confirmada_por_id = p_usuario_id,
        foto_recepcion_url = p_foto_url,
        latitud_recepcion = p_latitud,
        longitud_recepcion = p_longitud,
        estado = 'en_curso'
    WHERE id = p_transferencia_id;
  ELSE
    RAISE EXCEPTION 'modo_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_transferencia
  FROM public.transferencias_custodia
  WHERE id = p_transferencia_id;

  IF v_transferencia.confirma_entrega_at IS NOT NULL
     AND v_transferencia.confirma_recepcion_at IS NOT NULL THEN
    UPDATE public.transferencias_custodia
    SET estado = 'confirmada'
    WHERE id = p_transferencia_id;

    SELECT reporte_id INTO v_reporte_id
    FROM public.custodias_temporales
    WHERE id = v_transferencia.custodia_id;

    UPDATE public.custodias_temporales
    SET estado = 'transferido',
        asociacion_coordinadora_id = v_transferencia.asociacion_receptora_id
    WHERE id = v_transferencia.custodia_id;

    UPDATE public.reportes
    SET asociacion_asignada_id = v_transferencia.asociacion_receptora_id
    WHERE id = v_reporte_id;

    UPDATE public.solicitudes_relevo
    SET estado = 'resuelta', resuelta_at = now()
    WHERE id = v_transferencia.solicitud_relevo_id;

    RETURN 'confirmada';
  END IF;

  RETURN 'en_curso';
END;
$function$;

REVOKE ALL ON FUNCTION public.confirmar_transferencia_custodia(
  uuid, uuid, text, text, numeric, numeric
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.confirmar_transferencia_custodia(
  uuid, uuid, text, text, numeric, numeric
) TO service_role;

COMMIT;
