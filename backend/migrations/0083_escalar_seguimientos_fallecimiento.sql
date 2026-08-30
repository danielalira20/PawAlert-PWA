-- Supervisa los plazos de 24 y 48 horas del seguimiento por fallecimiento.
-- El vencimiento escala la responsabilidad y encola avisos; nunca cierra el
-- reporte ni afirma que el retiro fue realizado.

CREATE OR REPLACE FUNCTION public.escalar_seguimientos_fallecimiento(
  p_limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_seguimiento public.seguimientos_fallecimiento_reporte%ROWTYPE;
  v_estado_nuevo text;
  v_nivel text;
  v_asociacion_count integer := 0;
  v_administracion_count integer := 0;
  v_notificaciones_count integer := 0;
  v_insertadas integer := 0;
BEGIN
  IF p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'limite_seguimientos_fallecimiento_invalido'
      USING ERRCODE = '22023';
  END IF;

  FOR v_seguimiento IN
    SELECT seguimiento.*
    FROM public.seguimientos_fallecimiento_reporte seguimiento
    JOIN public.reportes reporte ON reporte.id = seguimiento.reporte_id
    WHERE seguimiento.estado IN (
        'pendiente_voluntario',
        'pendiente_asociacion'
      )
      AND reporte.estado_reporte::text = 'pendiente_seguimiento_fallecimiento'
      AND (
        seguimiento.administracion_deadline_at <= now()
        OR (
          seguimiento.estado = 'pendiente_voluntario'
          AND seguimiento.asociacion_deadline_at <= now()
        )
      )
    ORDER BY
      CASE
        WHEN seguimiento.administracion_deadline_at <= now() THEN 0
        ELSE 1
      END,
      LEAST(
        seguimiento.asociacion_deadline_at,
        seguimiento.administracion_deadline_at
      )
    LIMIT p_limit
    FOR UPDATE OF seguimiento SKIP LOCKED
  LOOP
    IF v_seguimiento.administracion_deadline_at <= now()
       OR v_seguimiento.asociacion_coordinadora_id IS NULL THEN
      v_estado_nuevo := 'escalado_administracion';
      v_nivel := 'administracion';
      v_administracion_count := v_administracion_count + 1;
    ELSE
      v_estado_nuevo := 'pendiente_asociacion';
      v_nivel := 'asociacion';
      v_asociacion_count := v_asociacion_count + 1;
    END IF;

    UPDATE public.seguimientos_fallecimiento_reporte
    SET estado = v_estado_nuevo,
        actualizado_at = now()
    WHERE id = v_seguimiento.id;

    INSERT INTO public.historial_reporte (
      reporte_id,
      usuario_id,
      tipo_evento,
      descripcion,
      datos_extra
    ) VALUES (
      v_seguimiento.reporte_id,
      NULL,
      'seguimiento_fallecimiento_escalado',
      CASE v_nivel
        WHEN 'asociacion' THEN
          'El seguimiento venció y requiere atención de la asociación coordinadora'
        ELSE
          'El seguimiento venció y requiere revisión de administración'
      END,
      jsonb_build_object(
        'seguimiento_id', v_seguimiento.id,
        'nivel', v_nivel,
        'estado_anterior', v_seguimiento.estado,
        'estado_nuevo', v_estado_nuevo,
        'deadline_at', CASE v_nivel
          WHEN 'asociacion' THEN v_seguimiento.asociacion_deadline_at
          ELSE v_seguimiento.administracion_deadline_at
        END,
        'sin_asociacion_coordinadora',
          v_seguimiento.asociacion_coordinadora_id IS NULL
      )
    );

    IF v_nivel = 'asociacion' THEN
      INSERT INTO public.notificaciones_push (
        usuario_id,
        reporte_id,
        tipo_evento,
        payload,
        idempotency_key
      )
      SELECT
        usuario.id,
        v_seguimiento.reporte_id,
        'seguimiento_fallecimiento_asociacion_vencido',
        jsonb_build_object(
          'reporte_id', v_seguimiento.reporte_id,
          'seguimiento_id', v_seguimiento.id,
          'destino', 'seguimiento_fallecimiento'
        ),
        'seguimiento_fallecimiento:24h:' || v_seguimiento.id::text
      FROM public.usuarios usuario
      JOIN public.roles rol ON rol.id = usuario.rol_id
      WHERE usuario.asociacion_id = v_seguimiento.asociacion_coordinadora_id
        AND rol.nombre IN ('asociacion', 'staff')
      ON CONFLICT (usuario_id, idempotency_key) DO NOTHING;
    ELSE
      INSERT INTO public.notificaciones_push (
        usuario_id,
        reporte_id,
        tipo_evento,
        payload,
        idempotency_key
      )
      SELECT
        usuario.id,
        v_seguimiento.reporte_id,
        'seguimiento_fallecimiento_administracion_vencido',
        jsonb_build_object(
          'reporte_id', v_seguimiento.reporte_id,
          'seguimiento_id', v_seguimiento.id,
          'destino', 'seguimiento_fallecimiento'
        ),
        'seguimiento_fallecimiento:48h:' || v_seguimiento.id::text
      FROM public.usuarios usuario
      JOIN public.roles rol ON rol.id = usuario.rol_id
      WHERE rol.nombre = 'admin'
      ON CONFLICT (usuario_id, idempotency_key) DO NOTHING;
    END IF;

    GET DIAGNOSTICS v_insertadas = ROW_COUNT;
    v_notificaciones_count := v_notificaciones_count + v_insertadas;
  END LOOP;

  RETURN jsonb_build_object(
    'procesados', v_asociacion_count + v_administracion_count,
    'escalados_asociacion', v_asociacion_count,
    'escalados_administracion', v_administracion_count,
    'notificaciones_encoladas', v_notificaciones_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.escalar_seguimientos_fallecimiento(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.escalar_seguimientos_fallecimiento(integer)
  TO service_role;

COMMENT ON FUNCTION public.escalar_seguimientos_fallecimiento(integer) IS
  'Escala seguimientos vencidos a asociación o administración y encola push de forma idempotente; nunca cierra reportes.';
