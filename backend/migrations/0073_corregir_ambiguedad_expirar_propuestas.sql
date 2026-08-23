-- Corrige el error 42702 "column reference ... is ambiguous" en
-- expirar_propuestas_cobertura_detalladas, presente sin cambios desde
-- 0065/0066: RETURNS TABLE declara columnas de salida (propuesta_id,
-- reporte_id, voluntario_id, usuario_asignado_id, asociacion_coordinadora_id,
-- origen, vence_at) que PL/pgSQL trata como variables implícitas visibles en
-- todo el cuerpo de la función -- sin necesidad de DECLARE. Esas variables
-- chocan contra columnas homónimas de las tablas consultadas cuando se
-- referencian sin calificar. No toca 0065 ni 0066: reemplaza la función con
-- CREATE OR REPLACE, mismo RETURNS TABLE y misma lógica en todo lo demás.
--
-- Referencias corregidas:
--   1-3. En el cursor sobre propuestas_asignacion: vence_at IS NOT NULL,
--        vence_at <= now(), ORDER BY vence_at -> calificadas como
--        propuestas_asignacion.vence_at (el choque ya diagnosticado).
--   4-5. Hallazgo adicional al armar este CREATE OR REPLACE completo: el
--        UPDATE de voluntario_ofrecimientos tiene el mismo problema con
--        reporte_id y voluntario_id (ambas son columnas reales de esa tabla
--        Y nombres de variable OUT) en
--        "WHERE reporte_id = v_propuesta.reporte_id AND voluntario_id =
--        v_propuesta.voluntario_id" -- no se había detectado en el
--        diagnóstico original porque el cursor revienta primero y esa
--        sentencia nunca llega a ejecutarse. Calificadas como
--        voluntario_ofrecimientos.reporte_id/voluntario_id.

BEGIN;

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
      AND propuestas_asignacion.vence_at IS NOT NULL
      AND propuestas_asignacion.vence_at <= now()
    ORDER BY propuestas_asignacion.vence_at
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
    WHERE voluntario_ofrecimientos.reporte_id = v_propuesta.reporte_id
      AND voluntario_ofrecimientos.voluntario_id = v_propuesta.voluntario_id
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

    propuesta_id := v_propuesta.id;
    reporte_id := v_propuesta.reporte_id;
    voluntario_id := v_propuesta.voluntario_id;
    usuario_asignado_id := v_propuesta.usuario_asignado_id;
    asociacion_coordinadora_id := v_propuesta.asociacion_coordinadora_id;
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

COMMIT;
