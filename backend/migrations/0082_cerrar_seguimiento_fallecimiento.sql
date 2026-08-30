-- Cierra de forma humana, atomica e idempotente un seguimiento por
-- fallecimiento. Los vencimientos de 24/48 horas no invocan esta funcion:
-- solamente la asociacion coordinadora o administracion pueden cerrarlo.

BEGIN;

ALTER TABLE public.seguimientos_fallecimiento_reporte
  ADD COLUMN IF NOT EXISTS cierre_idempotency_key text,
  ADD COLUMN IF NOT EXISTS nota_cierre text;

CREATE UNIQUE INDEX IF NOT EXISTS seguimiento_fallecimiento_cierre_idempotente_idx
  ON public.seguimientos_fallecimiento_reporte(cierre_idempotency_key)
  WHERE cierre_idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.cerrar_seguimiento_fallecimiento(
  p_reporte_id uuid,
  p_usuario_id uuid,
  p_tipo_actor text,
  p_asociacion_id uuid,
  p_resultado_final text,
  p_idempotency_key text,
  p_nota_cierre text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_seguimiento public.seguimientos_fallecimiento_reporte%ROWTYPE;
  v_reporte public.reportes%ROWTYPE;
  v_estado_muerto_id uuid;
  v_estado_asignacion_completada_id uuid;
  v_total_resultados integer;
  v_resultados_pendientes integer;
  v_resultados_duda integer;
  v_resultados_no_confirmados integer;
  v_total_acciones integer;
  v_accion_compatible boolean;
BEGIN
  IF p_tipo_actor NOT IN ('asociacion', 'administracion') THEN
    RAISE EXCEPTION 'actor_cierre_fallecimiento_invalido'
      USING ERRCODE = '22023';
  END IF;

  IF p_resultado_final NOT IN (
    'contacto_realizado',
    'autoridad_atendio',
    'retiro_reportado',
    'retiro_confirmado',
    'sin_contacto_disponible',
    'voluntario_se_retiro_por_seguridad'
  ) THEN
    RAISE EXCEPTION 'resultado_final_fallecimiento_invalido'
      USING ERRCODE = '22023';
  END IF;

  IF NULLIF(trim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'idempotency_key_cierre_requerida'
      USING ERRCODE = '22023';
  END IF;

  IF length(trim(p_nota_cierre)) < 5 THEN
    RAISE EXCEPTION 'nota_cierre_fallecimiento_requerida'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_seguimiento
  FROM public.seguimientos_fallecimiento_reporte
  WHERE reporte_id = p_reporte_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'seguimiento_fallecimiento_no_encontrado'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_seguimiento.estado = 'cerrado' THEN
    IF v_seguimiento.cierre_idempotency_key = trim(p_idempotency_key)
       AND v_seguimiento.resultado_final = p_resultado_final THEN
      RETURN jsonb_build_object(
        'reporte_id', p_reporte_id,
        'seguimiento_id', v_seguimiento.id,
        'estado_seguimiento', 'cerrado',
        'estado_reporte', 'muerto',
        'resultado_final', v_seguimiento.resultado_final,
        'conclusion_rescate', v_seguimiento.conclusion_rescate,
        'cerrado_at', v_seguimiento.cerrado_at,
        'reutilizado', true
      );
    END IF;
    RAISE EXCEPTION 'seguimiento_fallecimiento_ya_cerrado'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_seguimiento.estado NOT IN (
    'pendiente_voluntario', 'pendiente_asociacion', 'escalado_administracion'
  ) THEN
    RAISE EXCEPTION 'seguimiento_fallecimiento_no_disponible'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_tipo_actor = 'asociacion' AND (
    p_asociacion_id IS NULL
    OR v_seguimiento.asociacion_coordinadora_id IS DISTINCT FROM p_asociacion_id
  ) THEN
    RAISE EXCEPTION 'asociacion_cierre_fallecimiento_no_autorizada'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reporte
  FROM public.reportes
  WHERE id = p_reporte_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_reporte.estado_reporte::text <> 'pendiente_seguimiento_fallecimiento' THEN
    RAISE EXCEPTION 'reporte_no_disponible_para_cierre_fallecimiento'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE estado = 'sin_vida_reportado'),
    count(*) FILTER (WHERE estado = 'duda_estado_critico'),
    count(*) FILTER (WHERE estado <> 'sin_vida_confirmado')
  INTO
    v_total_resultados,
    v_resultados_pendientes,
    v_resultados_duda,
    v_resultados_no_confirmados
  FROM public.resultados_rescate_animal
  WHERE reporte_id = p_reporte_id;

  IF v_total_resultados = 0 THEN
    RAISE EXCEPTION 'resultados_fallecimiento_requeridos'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_resultados_pendientes > 0 THEN
    RAISE EXCEPTION 'revision_fallecimiento_pendiente'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_resultados_duda > 0 THEN
    RAISE EXCEPTION 'duda_critica_impide_cierre_fallecimiento'
      USING ERRCODE = 'P0001';
  END IF;

  -- La asociacion solamente puede declarar el estado terminal cuando todos
  -- los resultados fueron confirmados. Administracion puede documentar un
  -- cierre con evidencia insuficiente tras revisar el expediente escalado.
  IF p_tipo_actor = 'asociacion' AND v_resultados_no_confirmados > 0 THEN
    RAISE EXCEPTION 'resultados_fallecimiento_no_confirmados'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_total_acciones
  FROM public.seguimientos_retiro_animal
  WHERE reporte_id = p_reporte_id;

  IF v_total_acciones = 0 THEN
    RAISE EXCEPTION 'seguimiento_retiro_requerido_para_cierre'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT CASE p_resultado_final
    WHEN 'contacto_realizado' THEN EXISTS (
      SELECT 1 FROM public.seguimientos_retiro_animal
      WHERE reporte_id = p_reporte_id
        AND accion = 'contacto_oficial_realizado'
    )
    WHEN 'autoridad_atendio' THEN EXISTS (
      SELECT 1 FROM public.seguimientos_retiro_animal
      WHERE reporte_id = p_reporte_id
        AND accion = 'autoridad_se_presento'
    )
    WHEN 'retiro_reportado' THEN EXISTS (
      SELECT 1 FROM public.seguimientos_retiro_animal
      WHERE reporte_id = p_reporte_id
        AND accion IN (
          'autoridad_se_presento',
          'tercero_responsable_se_hizo_cargo',
          'retiro_gestionado_con_indicaciones'
        )
    )
    WHEN 'retiro_confirmado' THEN EXISTS (
      SELECT 1 FROM public.seguimientos_retiro_animal
      WHERE reporte_id = p_reporte_id
        AND evidencia_lugar_id IS NOT NULL
        AND accion IN (
          'autoridad_se_presento',
          'tercero_responsable_se_hizo_cargo',
          'retiro_gestionado_con_indicaciones'
        )
    )
    WHEN 'sin_contacto_disponible' THEN EXISTS (
      SELECT 1 FROM public.seguimientos_retiro_animal
      WHERE reporte_id = p_reporte_id
        AND accion = 'sin_contacto_disponible'
    )
    WHEN 'voluntario_se_retiro_por_seguridad' THEN EXISTS (
      SELECT 1 FROM public.seguimientos_retiro_animal
      WHERE reporte_id = p_reporte_id
        AND accion = 'retiro_por_seguridad'
    )
    ELSE false
  END INTO v_accion_compatible;

  IF NOT v_accion_compatible THEN
    RAISE EXCEPTION 'resultado_final_sin_seguimiento_compatible'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_estado_muerto_id
  FROM public.reporte_estados
  WHERE clave = 'muerto'
  LIMIT 1;

  IF v_estado_muerto_id IS NULL THEN
    RAISE EXCEPTION 'estado_reporte_muerto_no_encontrado'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_estado_asignacion_completada_id
  FROM public.asignacion_estados
  WHERE clave = 'completada'
  LIMIT 1;

  UPDATE public.seguimientos_fallecimiento_reporte
  SET estado = 'cerrado',
      resultado_final = p_resultado_final,
      conclusion_rescate = 'fallecido_antes_de_llegada',
      cerrado_por_id = p_usuario_id,
      cerrado_at = now(),
      cierre_idempotency_key = trim(p_idempotency_key),
      nota_cierre = trim(p_nota_cierre),
      actualizado_at = now()
  WHERE id = v_seguimiento.id
  RETURNING * INTO v_seguimiento;

  UPDATE public.reportes
  SET estado_reporte = 'muerto',
      estado_id = v_estado_muerto_id,
      estado_cobertura = 'finalizado',
      staff_asignado_id = NULL,
      voluntario_id = NULL,
      confirmacion_voluntario = NULL,
      closed_at = COALESCE(closed_at, now()),
      updated_at = now()
  WHERE id = p_reporte_id;

  IF v_estado_asignacion_completada_id IS NOT NULL THEN
    UPDATE public.reporte_asignaciones
    SET estado_id = v_estado_asignacion_completada_id,
        estado = 'completada',
        closed_at = COALESCE(closed_at, now()),
        notas = CASE
          WHEN NULLIF(trim(notas), '') IS NULL
            THEN 'Cierre documentado por fallecimiento antes de la llegada'
          ELSE notas || E'\nCierre documentado por fallecimiento antes de la llegada'
        END
    WHERE reporte_id = p_reporte_id
      AND closed_at IS NULL;
  END IF;

  INSERT INTO public.historial_reporte (
    reporte_id, usuario_id, tipo_evento, descripcion, datos_extra
  ) VALUES (
    p_reporte_id,
    p_usuario_id,
    'reporte_cerrado_fallecimiento',
    'El seguimiento fue cerrado mediante revisión humana documentada',
    jsonb_build_object(
      'seguimiento_id', v_seguimiento.id,
      'tipo_actor', p_tipo_actor,
      'resultado_final', p_resultado_final,
      'conclusion_rescate', 'fallecido_antes_de_llegada',
      'nota_cierre', trim(p_nota_cierre),
      'total_resultados', v_total_resultados,
      'total_acciones', v_total_acciones
    )
  );

  RETURN jsonb_build_object(
    'reporte_id', p_reporte_id,
    'seguimiento_id', v_seguimiento.id,
    'estado_seguimiento', 'cerrado',
    'estado_reporte', 'muerto',
    'resultado_final', p_resultado_final,
    'conclusion_rescate', 'fallecido_antes_de_llegada',
    'cerrado_at', v_seguimiento.cerrado_at,
    'reutilizado', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cerrar_seguimiento_fallecimiento(
  uuid, uuid, text, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cerrar_seguimiento_fallecimiento(
  uuid, uuid, text, uuid, text, text, text
) TO service_role;

COMMENT ON FUNCTION public.cerrar_seguimiento_fallecimiento(
  uuid, uuid, text, uuid, text, text, text
) IS
  'Cierra un seguimiento de fallecimiento solo con revision humana, gestion compatible e idempotencia.';

NOTIFY pgrst, 'reload schema';

COMMIT;
