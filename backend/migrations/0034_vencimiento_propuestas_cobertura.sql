-- Libera propuestas de cobertura vencidas sin permitir estados intermedios.

BEGIN;

CREATE OR REPLACE FUNCTION public.expirar_propuestas_cobertura()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_propuesta public.propuestas_asignacion%ROWTYPE;
  v_total integer := 0;
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

    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.expirar_propuestas_cobertura()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expirar_propuestas_cobertura()
  TO service_role;

COMMIT;
