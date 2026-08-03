-- El hogar temporal entrega primero; la recepción debe confirmarse en el
-- mismo punto, con una tolerancia máxima de 200 metros.

BEGIN;

CREATE OR REPLACE FUNCTION public.confirmar_transferencia_custodia(
  p_transferencia_id uuid, p_usuario_id uuid, p_modo text,
  p_foto_url text, p_latitud numeric, p_longitud numeric
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_transferencia public.transferencias_custodia%ROWTYPE;
  v_reporte_id uuid;
  v_distancia_metros numeric;
BEGIN
  SELECT * INTO v_transferencia FROM public.transferencias_custodia
  WHERE id = p_transferencia_id FOR UPDATE;

  IF NOT FOUND OR v_transferencia.estado NOT IN ('programada', 'en_curso') THEN
    RAISE EXCEPTION 'transferencia_no_disponible' USING ERRCODE = 'P0001';
  END IF;

  IF p_modo = 'entrega' THEN
    UPDATE public.transferencias_custodia
    SET confirma_entrega_at = COALESCE(confirma_entrega_at, now()),
        entrega_confirmada_por_id = p_usuario_id,
        foto_entrega_url = p_foto_url, latitud = p_latitud,
        longitud = p_longitud, estado = 'en_curso'
    WHERE id = p_transferencia_id;
  ELSIF p_modo = 'recepcion' THEN
    IF v_transferencia.confirma_entrega_at IS NULL THEN
      RAISE EXCEPTION 'entrega_pendiente' USING ERRCODE = 'P0001';
    END IF;

    v_distancia_metros := 6371000 * 2 * asin(sqrt(
      power(sin(radians((p_latitud - v_transferencia.latitud)::double precision) / 2), 2)
      + cos(radians(v_transferencia.latitud::double precision))
      * cos(radians(p_latitud::double precision))
      * power(sin(radians((p_longitud - v_transferencia.longitud)::double precision) / 2), 2)
    ));
    IF v_distancia_metros > 200 THEN
      RAISE EXCEPTION 'confirmaciones_distantes' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.transferencias_custodia
    SET confirma_recepcion_at = now(), recepcion_confirmada_por_id = p_usuario_id,
        foto_recepcion_url = p_foto_url, latitud_recepcion = p_latitud,
        longitud_recepcion = p_longitud, estado = 'en_curso'
    WHERE id = p_transferencia_id;
  ELSE
    RAISE EXCEPTION 'modo_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_transferencia FROM public.transferencias_custodia
  WHERE id = p_transferencia_id;
  IF v_transferencia.confirma_entrega_at IS NOT NULL
     AND v_transferencia.confirma_recepcion_at IS NOT NULL THEN
    UPDATE public.transferencias_custodia SET estado = 'confirmada'
    WHERE id = p_transferencia_id;
    SELECT reporte_id INTO v_reporte_id FROM public.custodias_temporales
    WHERE id = v_transferencia.custodia_id;
    UPDATE public.custodias_temporales
    SET estado = 'transferido', asociacion_coordinadora_id = v_transferencia.asociacion_receptora_id
    WHERE id = v_transferencia.custodia_id;
    UPDATE public.reportes SET asociacion_asignada_id = v_transferencia.asociacion_receptora_id
    WHERE id = v_reporte_id;
    UPDATE public.solicitudes_relevo SET estado = 'resuelta', resuelta_at = now()
    WHERE id = v_transferencia.solicitud_relevo_id;
    RETURN 'confirmada';
  END IF;
  RETURN 'en_curso';
END;
$function$;

REVOKE ALL ON FUNCTION public.confirmar_transferencia_custodia(uuid, uuid, text, text, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_transferencia_custodia(uuid, uuid, text, text, numeric, numeric)
  TO service_role;

COMMIT;
