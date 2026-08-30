-- Revision humana de resultados sensibles. Una duda critica prepara la
-- reactivacion sin abrir cobertura hasta que el backend recalcule Urgency.

BEGIN;

ALTER TABLE public.casos_administrativos
  DROP CONSTRAINT IF EXISTS casos_administrativos_tipo_check;

ALTER TABLE public.casos_administrativos
  ADD CONSTRAINT casos_administrativos_tipo_check CHECK (tipo IN (
    'reporte_sin_coordinadora',
    'relevo_sin_respuesta',
    'cancelacion_en_atencion',
    'duda_fallecimiento_post_cierre'
  ));

CREATE OR REPLACE FUNCTION public.revisar_resultado_rescate_sin_vida(
  p_reporte_id uuid,
  p_resultado_id uuid,
  p_usuario_id uuid,
  p_asociacion_id uuid,
  p_decision text,
  p_notas text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_resultado public.resultados_rescate_animal%ROWTYPE;
  v_seguimiento public.seguimientos_fallecimiento_reporte%ROWTYPE;
  v_reporte public.reportes%ROWTYPE;
  v_estado_resultado text;
  v_evento text;
  v_estado_asignado_id uuid;
  v_post_cierre boolean := false;
BEGIN
  IF p_decision NOT IN ('confirmar', 'duda_critica', 'evidencia_insuficiente') THEN
    RAISE EXCEPTION 'decision_revision_invalida' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(trim(p_notas), '') IS NULL THEN
    RAISE EXCEPTION 'notas_revision_requeridas' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_seguimiento
  FROM public.seguimientos_fallecimiento_reporte
  WHERE reporte_id = p_reporte_id
  FOR UPDATE;

  IF NOT FOUND OR v_seguimiento.asociacion_coordinadora_id IS DISTINCT FROM p_asociacion_id THEN
    RAISE EXCEPTION 'seguimiento_no_autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reporte
  FROM public.reportes
  WHERE id = p_reporte_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reporte_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_resultado
  FROM public.resultados_rescate_animal
  WHERE id = p_resultado_id
    AND reporte_id = p_reporte_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'resultado_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  v_estado_resultado := CASE p_decision
    WHEN 'confirmar' THEN 'sin_vida_confirmado'
    WHEN 'duda_critica' THEN 'duda_estado_critico'
    ELSE 'evidencia_insuficiente'
  END;
  v_evento := CASE p_decision
    WHEN 'confirmar' THEN 'revision_fallecimiento_confirmada'
    WHEN 'duda_critica' THEN 'revision_fallecimiento_con_duda'
    ELSE 'revision_fallecimiento_insuficiente'
  END;

  IF v_resultado.estado = v_estado_resultado THEN
    RETURN jsonb_build_object(
      'reporte_id', p_reporte_id,
      'resultado_id', p_resultado_id,
      'estado_resultado', v_resultado.estado,
      'reutilizado', true,
      'requiere_reactivacion', p_decision = 'duda_critica'
        AND v_seguimiento.estado = 'reactivado'
        AND (
          v_reporte.estado_validacion_reporte <> 'aprobado'
          OR v_reporte.estado_cobertura IS DISTINCT FROM 'abierto'
        ),
      'estado_reporte', v_reporte.estado_reporte,
      'estado_validacion_reporte', v_reporte.estado_validacion_reporte
    );
  END IF;

  IF v_resultado.estado = 'duda_estado_critico' THEN
    RAISE EXCEPTION 'revision_duda_no_reversible' USING ERRCODE = 'P0001';
  END IF;
  IF v_seguimiento.estado = 'reactivado' AND p_decision <> 'duda_critica' THEN
    RAISE EXCEPTION 'seguimiento_ya_reactivado' USING ERRCODE = 'P0001';
  END IF;

  v_post_cierre := v_seguimiento.estado = 'cerrado';

  UPDATE public.resultados_rescate_animal
  SET estado = v_estado_resultado,
      revisado_por_id = p_usuario_id,
      revision_notas = trim(p_notas),
      revisado_at = now(),
      actualizado_at = now()
  WHERE id = p_resultado_id
  RETURNING * INTO v_resultado;

  INSERT INTO public.historial_reporte (
    reporte_id, usuario_id, tipo_evento, descripcion, datos_extra
  ) VALUES (
    p_reporte_id,
    p_usuario_id,
    v_evento,
    CASE p_decision
      WHEN 'confirmar' THEN 'La asociación confirmó el resultado después de revisión humana'
      WHEN 'duda_critica' THEN 'La asociación detectó una duda crítica en el resultado'
      ELSE 'La asociación indicó que la evidencia no es suficiente para confirmar el resultado'
    END,
    jsonb_build_object(
      'resultado_id', p_resultado_id,
      'animal_id', v_resultado.animal_id,
      'decision', p_decision,
      'post_cierre', v_post_cierre
    )
  );

  IF p_decision <> 'duda_critica' THEN
    RETURN jsonb_build_object(
      'reporte_id', p_reporte_id,
      'resultado_id', p_resultado_id,
      'estado_resultado', v_resultado.estado,
      'reutilizado', false,
      'requiere_reactivacion', false,
      'estado_reporte', v_reporte.estado_reporte
    );
  END IF;

  IF v_post_cierre THEN
    INSERT INTO public.casos_administrativos (
      reporte_id, tipo, prioridad, detalle
    ) VALUES (
      p_reporte_id,
      'duda_fallecimiento_post_cierre',
      'critica',
      'Se registró una duda crítica después del cierre. Requiere intervención administrativa.'
    )
    ON CONFLICT DO NOTHING;

    RETURN jsonb_build_object(
      'reporte_id', p_reporte_id,
      'resultado_id', p_resultado_id,
      'estado_resultado', v_resultado.estado,
      'reutilizado', false,
      'requiere_reactivacion', false,
      'requiere_administracion', true,
      'estado_reporte', v_reporte.estado_reporte
    );
  END IF;

  IF v_reporte.estado_reporte::text <> 'pendiente_seguimiento_fallecimiento' THEN
    RAISE EXCEPTION 'reporte_no_disponible_para_reactivar' USING ERRCODE = 'P0001';
  END IF;
  IF v_seguimiento.asociacion_coordinadora_id IS NULL THEN
    RAISE EXCEPTION 'asociacion_coordinadora_requerida' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_estado_asignado_id
  FROM public.reporte_estados
  WHERE clave = 'asignado'
  LIMIT 1;
  IF v_estado_asignado_id IS NULL THEN
    RAISE EXCEPTION 'estado_asignado_no_encontrado' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.seguimientos_fallecimiento_reporte
  SET estado = 'reactivado',
      actualizado_at = now()
  WHERE id = v_seguimiento.id;

  UPDATE public.reportes
  SET estado_reporte = 'asignado',
      estado_id = v_estado_asignado_id,
      estado_cobertura = NULL,
      estado_validacion_reporte = 'urgency_pendiente',
      validacion_completada_at = now(),
      razones_validacion = COALESCE(razones_validacion, '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object(
          'codigo', 'reactivacion_duda_fallecimiento',
          'resultado', 'urgency_pendiente',
          'resultado_id', p_resultado_id
        )),
      staff_asignado_id = NULL,
      voluntario_id = NULL,
      confirmacion_voluntario = NULL,
      candidatos_presentados_at = NULL,
      urgency_score = NULL,
      urgency_nivel = NULL,
      urgency_calculado_at = NULL,
      urgency_proximo_recalculo_at = now(),
      urgency_excluido = false,
      urgency_razones_exclusion = '[]'::jsonb,
      urgency_score_operativo = NULL,
      urgency_nivel_operativo = NULL,
      urgency_operativo_actualizado_at = NULL,
      updated_at = now()
  WHERE id = p_reporte_id;

  RETURN jsonb_build_object(
    'reporte_id', p_reporte_id,
    'resultado_id', p_resultado_id,
    'estado_resultado', v_resultado.estado,
    'reutilizado', false,
    'requiere_reactivacion', true,
    'estado_reporte', 'asignado',
    'estado_validacion_reporte', 'urgency_pendiente'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_reactivacion_duda_fallecimiento(
  p_reporte_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_reporte public.reportes%ROWTYPE;
  v_seguimiento public.seguimientos_fallecimiento_reporte%ROWTYPE;
BEGIN
  SELECT * INTO v_seguimiento
  FROM public.seguimientos_fallecimiento_reporte
  WHERE reporte_id = p_reporte_id
  FOR UPDATE;
  IF NOT FOUND OR v_seguimiento.estado <> 'reactivado' THEN
    RAISE EXCEPTION 'seguimiento_no_preparado_para_reactivar' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_reporte
  FROM public.reportes
  WHERE id = p_reporte_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reporte_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_reporte.estado_validacion_reporte = 'aprobado'
     AND v_reporte.estado_cobertura = 'abierto' THEN
    RETURN jsonb_build_object(
      'reporte_id', p_reporte_id,
      'estado', 'reactivado',
      'reutilizado', true
    );
  END IF;
  IF v_reporte.estado_validacion_reporte <> 'urgency_pendiente'
     OR v_reporte.estado_reporte::text <> 'asignado'
     OR v_reporte.estado_cobertura IS NOT NULL
     OR v_reporte.asociacion_asignada_id IS NULL THEN
    RAISE EXCEPTION 'reporte_no_preparado_para_reactivar' USING ERRCODE = 'P0001';
  END IF;
  IF v_reporte.urgency_score IS NULL OR v_reporte.urgency_calculado_at IS NULL THEN
    RAISE EXCEPTION 'urgency_recalculada_requerida' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.reportes
  SET estado_validacion_reporte = 'aprobado',
      validacion_completada_at = now(),
      estado_cobertura = 'abierto',
      activado_at = now(),
      updated_at = now()
  WHERE id = p_reporte_id;

  INSERT INTO public.historial_reporte (
    reporte_id, tipo_evento, descripcion, datos_extra
  ) VALUES (
    p_reporte_id,
    'reporte_reactivado_por_duda',
    'El reporte volvió a cobertura después de recalcular su urgencia',
    jsonb_build_object(
      'urgency_score', v_reporte.urgency_score,
      'urgency_nivel', v_reporte.urgency_nivel,
      'asociacion_id', v_reporte.asociacion_asignada_id
    )
  );

  RETURN jsonb_build_object(
    'reporte_id', p_reporte_id,
    'estado', 'reactivado',
    'reutilizado', false,
    'estado_reporte', 'asignado',
    'estado_cobertura', 'abierto',
    'urgency_score', v_reporte.urgency_score,
    'urgency_nivel', v_reporte.urgency_nivel
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.revisar_resultado_rescate_sin_vida(
  uuid, uuid, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revisar_resultado_rescate_sin_vida(
  uuid, uuid, uuid, uuid, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.finalizar_reactivacion_duda_fallecimiento(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_reactivacion_duda_fallecimiento(uuid)
TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
