-- El relevo se reserva, autoriza y confirma antes de revelar el destino.
-- Rafael conserva la custodia hasta que ambas partes confirman la entrega.

BEGIN;

ALTER TABLE public.custodias_temporales
  DROP CONSTRAINT IF EXISTS custodias_temporales_reporte_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS custodia_activa_por_reporte
  ON public.custodias_temporales(reporte_id)
  WHERE estado IN ('activo', 'extension_pendiente', 'buscando_relevo', 'traslado_programado');

CREATE TABLE IF NOT EXISTS public.ofertas_relevo_custodia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_relevo_id uuid NOT NULL REFERENCES public.solicitudes_relevo(id) ON DELETE CASCADE,
  asociacion_receptora_id uuid NOT NULL REFERENCES public.asociaciones(id) ON DELETE RESTRICT,
  creada_por_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  tipo_destino text NOT NULL CHECK (tipo_destino IN ('ingreso_asociacion', 'hogar_temporal')),
  voluntario_receptor_id uuid REFERENCES public.voluntarios(id) ON DELETE RESTRICT,
  responsable_recepcion text NOT NULL,
  direccion_recepcion text NOT NULL,
  latitud_recepcion numeric NOT NULL,
  longitud_recepcion numeric NOT NULL,
  ventana_inicio timestamptz NOT NULL,
  ventana_fin timestamptz NOT NULL,
  nueva_fecha_limite timestamptz,
  estado text NOT NULL DEFAULT 'pendiente_coordinadora' CHECK (estado IN (
    'pendiente_coordinadora', 'autorizada', 'confirmada_transporte',
    'rechazada', 'cancelada', 'expirada'
  )),
  autorizada_por_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  autorizada_at timestamptz,
  respuesta_transporte_at timestamptz,
  creada_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ventana_fin > ventana_inicio),
  CHECK (
    (tipo_destino = 'ingreso_asociacion' AND voluntario_receptor_id IS NULL)
    OR
    (tipo_destino = 'hogar_temporal' AND voluntario_receptor_id IS NOT NULL AND nueva_fecha_limite IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS oferta_relevo_activa_por_solicitud
  ON public.ofertas_relevo_custodia(solicitud_relevo_id)
  WHERE estado IN ('pendiente_coordinadora', 'autorizada', 'confirmada_transporte');

ALTER TABLE public.transferencias_custodia
  ADD COLUMN IF NOT EXISTS oferta_relevo_id uuid REFERENCES public.ofertas_relevo_custodia(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo_destino text CHECK (tipo_destino IN ('ingreso_asociacion', 'hogar_temporal')),
  ADD COLUMN IF NOT EXISTS voluntario_receptor_id uuid REFERENCES public.voluntarios(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS responsable_recepcion text,
  ADD COLUMN IF NOT EXISTS direccion_recepcion text,
  ADD COLUMN IF NOT EXISTS latitud_destino numeric,
  ADD COLUMN IF NOT EXISTS longitud_destino numeric,
  ADD COLUMN IF NOT EXISTS ventana_inicio timestamptz,
  ADD COLUMN IF NOT EXISTS ventana_fin timestamptz,
  ADD COLUMN IF NOT EXISTS nueva_fecha_limite timestamptz,
  ADD COLUMN IF NOT EXISTS traslado_iniciado_at timestamptz;

ALTER TABLE public.transferencias_custodia
  DROP CONSTRAINT IF EXISTS transferencias_custodia_estado_check;
ALTER TABLE public.transferencias_custodia
  ADD CONSTRAINT transferencias_custodia_estado_check CHECK (
    estado IN ('programada', 'en_traslado', 'en_curso', 'confirmada', 'cancelada')
  );

CREATE OR REPLACE FUNCTION public.ofrecer_relevo_custodia(
  p_solicitud_id uuid, p_asociacion_id uuid, p_usuario_id uuid,
  p_tipo_destino text, p_voluntario_receptor_id uuid,
  p_responsable text, p_direccion text, p_latitud numeric, p_longitud numeric,
  p_ventana_inicio timestamptz, p_ventana_fin timestamptz,
  p_nueva_fecha_limite timestamptz
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_solicitud public.solicitudes_relevo%ROWTYPE;
  v_oferta_id uuid;
BEGIN
  SELECT * INTO v_solicitud FROM public.solicitudes_relevo
  WHERE id = p_solicitud_id FOR UPDATE;
  IF NOT FOUND OR v_solicitud.estado <> 'abierta' THEN
    RAISE EXCEPTION 'relevo_no_disponible' USING ERRCODE = 'P0001';
  END IF;
  IF p_tipo_destino NOT IN ('ingreso_asociacion', 'hogar_temporal')
     OR p_ventana_fin <= p_ventana_inicio THEN
    RAISE EXCEPTION 'datos_recepcion_invalidos' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.ofertas_relevo_custodia (
    solicitud_relevo_id, asociacion_receptora_id, creada_por_id,
    tipo_destino, voluntario_receptor_id, responsable_recepcion,
    direccion_recepcion, latitud_recepcion, longitud_recepcion,
    ventana_inicio, ventana_fin, nueva_fecha_limite
  ) VALUES (
    p_solicitud_id, p_asociacion_id, p_usuario_id,
    p_tipo_destino, p_voluntario_receptor_id, p_responsable,
    p_direccion, p_latitud, p_longitud,
    p_ventana_inicio, p_ventana_fin, p_nueva_fecha_limite
  ) RETURNING id INTO v_oferta_id;
  UPDATE public.solicitudes_relevo SET estado = 'reservada',
    asociacion_receptora_id = p_asociacion_id, reservada_at = now()
  WHERE id = p_solicitud_id;
  RETURN v_oferta_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.confirmar_transporte_relevo(
  p_oferta_id uuid, p_puede_transportar boolean
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_oferta public.ofertas_relevo_custodia%ROWTYPE;
  v_solicitud public.solicitudes_relevo%ROWTYPE;
  v_custodia public.custodias_temporales%ROWTYPE;
  v_transferencia_id uuid;
BEGIN
  SELECT * INTO v_oferta FROM public.ofertas_relevo_custodia
  WHERE id = p_oferta_id FOR UPDATE;
  IF NOT FOUND OR v_oferta.estado <> 'autorizada' THEN
    RAISE EXCEPTION 'oferta_no_disponible' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_solicitud FROM public.solicitudes_relevo
  WHERE id = v_oferta.solicitud_relevo_id FOR UPDATE;
  SELECT * INTO v_custodia FROM public.custodias_temporales
  WHERE id = v_solicitud.custodia_id FOR UPDATE;
  IF NOT p_puede_transportar THEN
    UPDATE public.ofertas_relevo_custodia SET estado = 'cancelada',
      respuesta_transporte_at = now() WHERE id = p_oferta_id;
    UPDATE public.solicitudes_relevo SET estado = 'abierta',
      asociacion_receptora_id = NULL, reservada_at = NULL
    WHERE id = v_solicitud.id;
    RETURN NULL;
  END IF;
  UPDATE public.ofertas_relevo_custodia SET estado = 'confirmada_transporte',
    respuesta_transporte_at = now() WHERE id = p_oferta_id;
  INSERT INTO public.transferencias_custodia (
    custodia_id, solicitud_relevo_id, oferta_relevo_id,
    asociacion_origen_id, asociacion_receptora_id, fecha_programada,
    tipo_destino, voluntario_receptor_id, responsable_recepcion,
    direccion_recepcion, latitud_destino, longitud_destino,
    ventana_inicio, ventana_fin, nueva_fecha_limite, estado
  ) VALUES (
    v_custodia.id, v_solicitud.id, v_oferta.id,
    v_custodia.asociacion_coordinadora_id, v_oferta.asociacion_receptora_id,
    v_oferta.ventana_inicio, v_oferta.tipo_destino, v_oferta.voluntario_receptor_id,
    v_oferta.responsable_recepcion, v_oferta.direccion_recepcion,
    v_oferta.latitud_recepcion, v_oferta.longitud_recepcion,
    v_oferta.ventana_inicio, v_oferta.ventana_fin, v_oferta.nueva_fecha_limite,
    'programada'
  ) RETURNING id INTO v_transferencia_id;
  UPDATE public.custodias_temporales SET estado = 'traslado_programado'
  WHERE id = v_custodia.id;
  RETURN v_transferencia_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.confirmar_transferencia_custodia(
  p_transferencia_id uuid, p_usuario_id uuid, p_modo text,
  p_foto_url text, p_latitud numeric, p_longitud numeric
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_transferencia public.transferencias_custodia%ROWTYPE;
  v_custodia public.custodias_temporales%ROWTYPE;
  v_distancia_destino numeric;
  v_distancia_partes numeric;
BEGIN
  SELECT * INTO v_transferencia FROM public.transferencias_custodia
  WHERE id = p_transferencia_id FOR UPDATE;
  IF NOT FOUND OR v_transferencia.estado NOT IN ('en_traslado', 'en_curso') THEN
    RAISE EXCEPTION 'transferencia_no_disponible' USING ERRCODE = 'P0001';
  END IF;
  IF v_transferencia.ventana_inicio IS NOT NULL
     AND now() NOT BETWEEN v_transferencia.ventana_inicio - interval '2 hours'
                       AND v_transferencia.ventana_fin + interval '2 hours' THEN
    RAISE EXCEPTION 'fuera_ventana' USING ERRCODE = 'P0001';
  END IF;
  IF v_transferencia.latitud_destino IS NOT NULL THEN
    v_distancia_destino := 6371000 * 2 * asin(sqrt(
      power(sin(radians((p_latitud - v_transferencia.latitud_destino)::double precision) / 2), 2)
      + cos(radians(v_transferencia.latitud_destino::double precision))
      * cos(radians(p_latitud::double precision))
      * power(sin(radians((p_longitud - v_transferencia.longitud_destino)::double precision) / 2), 2)
    ));
    IF v_distancia_destino > 200 THEN
      RAISE EXCEPTION 'fuera_destino' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF p_modo = 'entrega' THEN
    UPDATE public.transferencias_custodia SET confirma_entrega_at = now(),
      entrega_confirmada_por_id = p_usuario_id, foto_entrega_url = p_foto_url,
      latitud = p_latitud, longitud = p_longitud, estado = 'en_curso'
    WHERE id = p_transferencia_id;
  ELSIF p_modo = 'recepcion' THEN
    IF v_transferencia.confirma_entrega_at IS NULL THEN
      RAISE EXCEPTION 'entrega_pendiente' USING ERRCODE = 'P0001';
    END IF;
    v_distancia_partes := 6371000 * 2 * asin(sqrt(
      power(sin(radians((p_latitud - v_transferencia.latitud)::double precision) / 2), 2)
      + cos(radians(v_transferencia.latitud::double precision)) * cos(radians(p_latitud::double precision))
      * power(sin(radians((p_longitud - v_transferencia.longitud)::double precision) / 2), 2)
    ));
    IF v_distancia_partes > 200 THEN
      RAISE EXCEPTION 'confirmaciones_distantes' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.transferencias_custodia SET confirma_recepcion_at = now(),
      recepcion_confirmada_por_id = p_usuario_id, foto_recepcion_url = p_foto_url,
      latitud_recepcion = p_latitud, longitud_recepcion = p_longitud, estado = 'en_curso'
    WHERE id = p_transferencia_id;
  ELSE
    RAISE EXCEPTION 'modo_invalido' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_transferencia FROM public.transferencias_custodia WHERE id = p_transferencia_id;
  IF v_transferencia.confirma_entrega_at IS NULL OR v_transferencia.confirma_recepcion_at IS NULL THEN
    RETURN 'en_curso';
  END IF;
  SELECT * INTO v_custodia FROM public.custodias_temporales
  WHERE id = v_transferencia.custodia_id FOR UPDATE;
  UPDATE public.transferencias_custodia SET estado = 'confirmada' WHERE id = p_transferencia_id;
  UPDATE public.custodias_temporales SET estado = 'transferido' WHERE id = v_custodia.id;
  UPDATE public.reportes SET asociacion_asignada_id = v_transferencia.asociacion_receptora_id
  WHERE id = v_custodia.reporte_id;
  UPDATE public.solicitudes_relevo SET estado = 'resuelta', resuelta_at = now()
  WHERE id = v_transferencia.solicitud_relevo_id;
  IF v_transferencia.tipo_destino = 'hogar_temporal' THEN
    INSERT INTO public.custodias_temporales (
      reporte_id, voluntario_id, asociacion_coordinadora_id, estado,
      inicio_at, fecha_limite, proximo_seguimiento_at, frecuencia_horas, ruta_ingreso
    ) VALUES (
      v_custodia.reporte_id, v_transferencia.voluntario_receptor_id,
      v_transferencia.asociacion_receptora_id, 'activo', now(),
      v_transferencia.nueva_fecha_limite, now() + interval '2 hours', 72, 'directo_hogar'
    );
  ELSE
    UPDATE public.custodias_temporales
    SET asociacion_coordinadora_id = v_transferencia.asociacion_receptora_id
    WHERE id = v_custodia.id;
  END IF;
  RETURN 'confirmada';
END;
$function$;

REVOKE ALL ON FUNCTION public.ofrecer_relevo_custodia(uuid, uuid, uuid, text, uuid, text, text, numeric, numeric, timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ofrecer_relevo_custodia(uuid, uuid, uuid, text, uuid, text, text, numeric, numeric, timestamptz, timestamptz, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.confirmar_transporte_relevo(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_transporte_relevo(uuid, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.confirmar_transferencia_custodia(uuid, uuid, text, text, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_transferencia_custodia(uuid, uuid, text, text, numeric, numeric) TO service_role;

COMMIT;
