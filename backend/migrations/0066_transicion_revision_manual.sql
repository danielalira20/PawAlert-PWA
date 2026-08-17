-- Corrige contratos de permanencia y centraliza la pausa operativa de reportes.

BEGIN;

ALTER TABLE public.reportes
  DROP CONSTRAINT IF EXISTS reportes_confirmacion_permanencia_respuesta_check;

ALTER TABLE public.reportes
  ADD CONSTRAINT reportes_confirmacion_permanencia_respuesta_check
  CHECK (
    confirmacion_permanencia_respuesta IS NULL
    OR confirmacion_permanencia_respuesta IN ('sigue_ahi', 'ya_no_esta', 'timeout')
  );

CREATE OR REPLACE FUNCTION public.transicion_revision_manual(
  p_reporte_id uuid,
  p_motivo text DEFAULT 'confirmacion_permanencia'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_reporte public.reportes%ROWTYPE;
  v_estado_rechazada_id uuid;
  v_estado_pendiente_id uuid;
  v_usuarios_propuesta jsonb := '[]'::jsonb;
  v_razon jsonb;
BEGIN
  SELECT * INTO v_reporte
  FROM public.reportes
  WHERE id = p_reporte_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reporte_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_reporte.estado_validacion_reporte = 'revision_manual' THEN
    RETURN jsonb_build_object(
      'estado', 'revision_manual',
      'ya_estaba_en_revision', true,
      'reporte_id', p_reporte_id
    );
  END IF;

  IF v_reporte.estado_validacion_reporte <> 'aprobado' THEN
    RAISE EXCEPTION 'reporte_no_aprobado' USING ERRCODE = 'P0001';
  END IF;

  IF v_reporte.estado_reporte::text IN (
       'en_camino', 'en_atencion', 'rescatado'
     )
     OR v_reporte.estado_cobertura IN ('confirmado', 'finalizado')
     OR v_reporte.confirmacion_voluntario = 'confirmado'
     OR EXISTS (
       SELECT 1
       FROM public.propuestas_asignacion pa
       WHERE pa.reporte_id = p_reporte_id
         AND pa.estado = 'confirmada'
     )
     OR EXISTS (
       SELECT 1
       FROM public.custodias_temporales ct
       WHERE ct.reporte_id = p_reporte_id
         AND ct.estado IN (
           'activo', 'extension_pendiente', 'buscando_relevo',
           'traslado_programado'
         )
     ) THEN
    RAISE EXCEPTION 'atencion_en_curso' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(jsonb_agg(DISTINCT pa.usuario_asignado_id), '[]'::jsonb)
  INTO v_usuarios_propuesta
  FROM public.propuestas_asignacion pa
  WHERE pa.reporte_id = p_reporte_id
    AND pa.estado = 'activa';

  UPDATE public.propuestas_asignacion
  SET estado = 'cancelada',
      respondida_at = now(),
      motivo_respuesta = 'El reporte quedó pausado para revisión manual'
  WHERE reporte_id = p_reporte_id
    AND estado = 'activa';

  UPDATE public.voluntario_ofrecimientos
  SET estado = 'expirado',
      actualizado_at = now()
  WHERE reporte_id = p_reporte_id
    AND estado IN ('vigente', 'seleccionado');

  SELECT id INTO v_estado_rechazada_id
  FROM public.asignacion_estados
  WHERE clave = 'rechazada'
  LIMIT 1;

  IF v_estado_rechazada_id IS NULL THEN
    RAISE EXCEPTION 'estado_asignacion_rechazada_no_encontrado'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_estado_pendiente_id
  FROM public.reporte_estados
  WHERE clave = 'pendiente'
  LIMIT 1;

  IF v_estado_pendiente_id IS NULL THEN
    RAISE EXCEPTION 'estado_reporte_pendiente_no_encontrado'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.reporte_asignaciones
  SET estado_id = v_estado_rechazada_id,
      estado = 'rechazada',
      closed_at = COALESCE(closed_at, now()),
      notas = CASE
        WHEN notas IS NULL OR trim(notas) = ''
          THEN 'Pausada automáticamente por revisión manual'
        ELSE notas || E'\nPausada automáticamente por revisión manual'
      END
  WHERE reporte_id = p_reporte_id
    AND closed_at IS NULL;

  v_razon = jsonb_build_object(
    'codigo', p_motivo,
    'resultado', 'revision_manual'
  );

  UPDATE public.reportes
  SET estado_id = v_estado_pendiente_id,
      estado_reporte = 'pendiente',
      estado_validacion_reporte = 'revision_manual',
      validacion_completada_at = NULL,
      razones_validacion = COALESCE(razones_validacion, '[]'::jsonb)
        || jsonb_build_array(v_razon),
      estado_moderacion = 'en_revision',
      moderacion_origen = p_motivo,
      moderacion_actualizada_at = now(),
      estado_cobertura = NULL,
      asociacion_asignada_id = NULL,
      staff_asignado_id = NULL,
      confirmacion_voluntario = NULL,
      activado_at = NULL,
      urgency_score = NULL,
      urgency_nivel = NULL,
      urgency_calculado_at = NULL,
      urgency_proximo_recalculo_at = NULL,
      urgency_excluido = true,
      urgency_razones_exclusion = jsonb_build_array(v_razon),
      confirmacion_permanencia_respuesta = CASE
        WHEN p_motivo = 'confirmacion_permanencia_timeout'
          AND confirmacion_permanencia_respuesta IS NULL
          THEN 'timeout'
        ELSE confirmacion_permanencia_respuesta
      END,
      confirmacion_permanencia_respondida_at = CASE
        WHEN p_motivo = 'confirmacion_permanencia_timeout'
          THEN COALESCE(confirmacion_permanencia_respondida_at, now())
        ELSE confirmacion_permanencia_respondida_at
      END
  WHERE id = p_reporte_id;

  INSERT INTO public.historial_reporte (
    reporte_id, usuario_id, tipo_evento, descripcion, datos_extra
  ) VALUES (
    p_reporte_id,
    NULL,
    'reporte_transicion_revision_manual',
    'El reporte quedó pausado para revisión manual.',
    jsonb_build_object(
      'motivo', p_motivo,
      'asociacion_coordinadora_id', v_reporte.asociacion_asignada_id,
      'usuarios_propuesta', v_usuarios_propuesta
    )
  );

  RETURN jsonb_build_object(
    'estado', 'revision_manual',
    'ya_estaba_en_revision', false,
    'reporte_id', p_reporte_id,
    'reportante_id', v_reporte.usuario_id,
    'asociacion_coordinadora_id', v_reporte.asociacion_asignada_id,
    'usuarios_propuesta', v_usuarios_propuesta
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.transicion_revision_manual(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transicion_revision_manual(uuid, text)
  TO service_role;

-- Reemplaza la versión 0065: la columna real es asociacion_coordinadora_id.
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
