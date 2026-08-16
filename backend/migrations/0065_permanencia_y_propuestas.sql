-- Fase 2: Tokens de permanencia y RPC detallada para Push Notifications

BEGIN;

-- 1. Tabla para Tokens de Invitados (Confirmación de Permanencia)
CREATE TABLE public.tokens_confirmacion_permanencia (
  token_hash text PRIMARY KEY,
  reporte_id uuid NOT NULL REFERENCES public.reportes(id) ON DELETE CASCADE,
  creado_at timestamptz NOT NULL DEFAULT now(),
  expira_at timestamptz NOT NULL,
  usado boolean NOT NULL DEFAULT false
);

-- Índice parcial para asegurar 1 solo token activo por reporte.
CREATE UNIQUE INDEX idx_token_permanencia_activo 
  ON public.tokens_confirmacion_permanencia (reporte_id) 
  WHERE usado = false;

-- 2. Nueva RPC para Propuestas Vencidas (D-4) que devuelve detalles
CREATE OR REPLACE FUNCTION public.expirar_propuestas_cobertura_detalladas()
RETURNS TABLE (
  propuesta_id uuid,
  reporte_id uuid,
  voluntario_id uuid,
  usuario_asignado_id uuid,
  asociacion_coordinadora_id uuid,
  origen text,
  vence_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_propuesta public.propuestas_asignacion%ROWTYPE;
BEGIN
  FOR v_propuesta IN
    SELECT *
    FROM public.propuestas_asignacion
    WHERE estado = 'activa'
      AND vence_at IS NOT NULL
      AND vence_at <= now()
    ORDER BY vence_at
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.propuestas_asignacion
    SET estado = 'vencida',
        respondida_at = now(),
        motivo_respuesta = 'Tiempo de respuesta agotado'
    WHERE id = v_propuesta.id
      AND estado = 'activa';

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    UPDATE public.reportes
    SET staff_asignado_id = NULL,
        confirmacion_voluntario = NULL,
        estado_cobertura = 'abierto'
    WHERE id = v_propuesta.reporte_id
      AND estado_cobertura = 'propuesta_enviada'
      AND staff_asignado_id = v_propuesta.usuario_asignado_id;

    UPDATE public.voluntario_ofrecimientos
    SET estado = 'vigente', actualizado_at = now()
    WHERE reporte_id = v_propuesta.reporte_id
      AND voluntario_id = v_propuesta.voluntario_id
      AND estado = 'seleccionado';

    INSERT INTO public.historial_reporte (
      reporte_id, usuario_id, tipo_evento, descripcion, datos_extra
    ) VALUES (
      v_propuesta.reporte_id,
      NULL,
      'propuesta_asignacion_vencida',
      'La propuesta venció y el caso volvió a estar disponible',
      jsonb_build_object(
        'propuesta_id', v_propuesta.id,
        'usuario_asignado_id', v_propuesta.usuario_asignado_id,
        'vence_at', v_propuesta.vence_at
      )
    );

    -- Retornar los datos de esta propuesta iteración por iteración
    propuesta_id := v_propuesta.id;
    reporte_id := v_propuesta.reporte_id;
    voluntario_id := v_propuesta.voluntario_id;
    usuario_asignado_id := v_propuesta.usuario_asignado_id;
    asociacion_coordinadora_id := v_propuesta.asociacion_id;
    origen := v_propuesta.origen;
    vence_at := v_propuesta.vence_at;
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.expirar_propuestas_cobertura_detalladas()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expirar_propuestas_cobertura_detalladas()
  TO service_role;

-- 3. RPC para obtener reportes inactivos (Regla Permanencia D-2)
CREATE OR REPLACE FUNCTION public.obtener_reportes_inactivos_permanencia()
RETURNS TABLE (
  reporte_id uuid,
  usuario_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.usuario_id 
  FROM reportes r
  WHERE r.estado_validacion_reporte = 'aprobado'
    AND r.urgency_nivel = 'verde'
    AND r.urgency_excluido = false
    AND r.created_at <= now() - interval '6 hours'
    AND r.confirmacion_voluntario IS DISTINCT FROM 'confirmado'
    AND r.confirmacion_permanencia_solicitada_at IS NULL
    AND r.estado_cobertura NOT IN ('propuesta_enviada', 'confirmado')
    AND NOT EXISTS (
      SELECT 1 FROM public.historial_reporte h
      WHERE h.reporte_id = r.id
        AND h.created_at > now() - interval '6 hours'
        AND h.tipo_evento IN ('llegada_zona_reporte', 'animal_encontrado', 'animal_no_localizado', 'animal_bajo_resguardo', 'llegada_veterinaria', 'llegada_hogar_temporal', 'hito_llegue_refugio')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.custodias_temporales ct
      WHERE ct.reporte_id = r.id
        AND ct.estado IN ('activo', 'extension_pendiente', 'buscando_relevo', 'traslado_programado')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.contribuciones c
      WHERE c.reporte_id = r.id
        AND c.estado IN ('confirmada', 'parcial', 'entregada')
    );
$$;

REVOKE ALL ON FUNCTION public.obtener_reportes_inactivos_permanencia()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_reportes_inactivos_permanencia()
  TO service_role;

-- 4. RLS para Tokens de Invitados
ALTER TABLE public.tokens_confirmacion_permanencia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tokens_confirmacion_permanencia FROM anon, authenticated;
GRANT ALL ON public.tokens_confirmacion_permanencia TO service_role;

COMMIT;
