-- Notifica al reportante cuando un resultado sensible entra a revision y
-- cuando la conclusion queda confirmada por una persona autorizada.

BEGIN;

CREATE OR REPLACE FUNCTION public.notificar_resultado_fallecimiento_reportante()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_reporte public.reportes%ROWTYPE;
  v_tipo_evento text;
  v_mensaje text;
  v_dedupe_key text;
  v_telefono text;
BEGIN
  IF NEW.tipo_evento NOT IN (
    'reporte_pendiente_seguimiento_fallecimiento',
    'reporte_cerrado_fallecimiento'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_reporte
  FROM public.reportes
  WHERE id = NEW.reporte_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.tipo_evento = 'reporte_pendiente_seguimiento_fallecimiento' THEN
    v_tipo_evento := 'resultado_rescate_en_revision';
    v_dedupe_key := 'resultado_rescate:revision:' || NEW.reporte_id::text;
    v_mensaje :=
      'El resultado del rescate requiere una revision humana. Te avisaremos cuando el seguimiento concluya.';
  ELSE
    v_tipo_evento := 'resultado_rescate_concluido';
    v_dedupe_key := 'resultado_rescate:conclusion:' || NEW.reporte_id::text;
    v_mensaje :=
      'Se confirmo que el animal fue encontrado sin vida antes de la llegada del apoyo. Lamentamos este resultado.';
  END IF;

  IF v_reporte.usuario_id IS NOT NULL THEN
    INSERT INTO public.notificaciones_push (
      usuario_id,
      reporte_id,
      tipo_evento,
      payload,
      idempotency_key
    ) VALUES (
      v_reporte.usuario_id,
      NEW.reporte_id,
      v_tipo_evento,
      jsonb_build_object(
        'reporte_id', NEW.reporte_id,
        'mensaje', v_mensaje,
        'destino', 'mis_reportes'
      ),
      v_dedupe_key
    )
    ON CONFLICT (usuario_id, idempotency_key) DO NOTHING;
  ELSIF NULLIF(trim(v_reporte.reportante_telefono), '') IS NOT NULL THEN
    v_telefono := regexp_replace(v_reporte.reportante_telefono, '[^0-9]', '', 'g');

    IF length(v_telefono) = 10 THEN
      v_telefono := '+52' || v_telefono;
    ELSIF length(v_telefono) = 12 AND left(v_telefono, 2) = '52' THEN
      v_telefono := '+' || v_telefono;
    ELSIF left(trim(v_reporte.reportante_telefono), 1) = '+' THEN
      v_telefono := '+' || v_telefono;
    ELSE
      v_telefono := NULL;
    END IF;

    IF v_telefono IS NOT NULL THEN
      INSERT INTO public.notificaciones_whatsapp (
        evento,
        dedupe_key,
        destinatario_tipo,
        destinatario_id,
        telefono,
        mensaje
      ) VALUES (
        v_tipo_evento,
        v_dedupe_key,
        'reportante_invitado',
        NEW.reporte_id,
        v_telefono,
        v_mensaje
      )
      ON CONFLICT (dedupe_key) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notificar_resultado_fallecimiento_reportante
  ON public.historial_reporte;

CREATE TRIGGER trg_notificar_resultado_fallecimiento_reportante
AFTER INSERT ON public.historial_reporte
FOR EACH ROW
WHEN (
  NEW.tipo_evento IN (
    'reporte_pendiente_seguimiento_fallecimiento',
    'reporte_cerrado_fallecimiento'
  )
)
EXECUTE FUNCTION public.notificar_resultado_fallecimiento_reportante();

REVOKE ALL ON FUNCTION public.notificar_resultado_fallecimiento_reportante()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notificar_resultado_fallecimiento_reportante()
  TO service_role;

COMMIT;
