-- Registra de forma idempotente las acciones de seguimiento posteriores a un
-- resultado sin vida. La accion documenta la gestion, pero no cierra por si
-- misma el reporte ni afirma que hubo un retiro confirmado.

BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_seguimiento_retiro_animal(
  p_reporte_id uuid,
  p_resultado_id uuid,
  p_usuario_id uuid,
  p_tipo_actor text,
  p_asociacion_id uuid,
  p_accion text,
  p_idempotency_key text,
  p_folio text DEFAULT NULL,
  p_nombre_servicio text DEFAULT NULL,
  p_destino_informado text DEFAULT NULL,
  p_nota text DEFAULT NULL,
  p_evidencia_lugar_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_seguimiento public.seguimientos_fallecimiento_reporte%ROWTYPE;
  v_resultado public.resultados_rescate_animal%ROWTYPE;
  v_accion public.seguimientos_retiro_animal%ROWTYPE;
  v_evidencia public.reporte_evidencias%ROWTYPE;
BEGIN
  IF p_tipo_actor NOT IN ('voluntario', 'asociacion', 'administracion') THEN
    RAISE EXCEPTION 'tipo_actor_seguimiento_invalido' USING ERRCODE = '22023';
  END IF;

  IF p_accion NOT IN (
    'contacto_oficial_realizado',
    'autoridad_se_presento',
    'tercero_responsable_se_hizo_cargo',
    'retiro_gestionado_con_indicaciones',
    'sin_comunicacion',
    'sin_contacto_disponible',
    'retiro_por_seguridad'
  ) THEN
    RAISE EXCEPTION 'accion_seguimiento_invalida' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(trim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'idempotency_key_requerida' USING ERRCODE = '22023';
  END IF;

  IF p_accion = 'retiro_gestionado_con_indicaciones'
     AND NULLIF(trim(p_nombre_servicio), '') IS NULL THEN
    RAISE EXCEPTION 'nombre_servicio_requerido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_seguimiento
  FROM public.seguimientos_fallecimiento_reporte
  WHERE reporte_id = p_reporte_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'seguimiento_fallecimiento_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_seguimiento.estado NOT IN (
    'pendiente_voluntario', 'pendiente_asociacion', 'escalado_administracion'
  ) THEN
    RAISE EXCEPTION 'seguimiento_fallecimiento_no_disponible' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_resultado
  FROM public.resultados_rescate_animal
  WHERE id = p_resultado_id
    AND reporte_id = p_reporte_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'resultado_seguimiento_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_resultado.estado = 'duda_estado_critico' THEN
    RAISE EXCEPTION 'resultado_reactivado_no_admite_seguimiento' USING ERRCODE = 'P0001';
  END IF;

  IF p_tipo_actor = 'voluntario'
     AND v_resultado.reportado_por_id IS DISTINCT FROM p_usuario_id THEN
    RAISE EXCEPTION 'voluntario_seguimiento_no_autorizado' USING ERRCODE = '42501';
  ELSIF p_tipo_actor = 'asociacion'
     AND (
       p_asociacion_id IS NULL
       OR v_seguimiento.asociacion_coordinadora_id IS DISTINCT FROM p_asociacion_id
     ) THEN
    RAISE EXCEPTION 'asociacion_seguimiento_no_autorizada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_accion
  FROM public.seguimientos_retiro_animal
  WHERE resultado_rescate_animal_id = p_resultado_id
    AND idempotency_key = trim(p_idempotency_key);

  IF FOUND THEN
    IF v_accion.registrado_por_id IS DISTINCT FROM p_usuario_id THEN
      RAISE EXCEPTION 'idempotency_key_en_conflicto' USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
      'reporte_id', p_reporte_id,
      'resultado_id', p_resultado_id,
      'seguimiento_retiro_id', v_accion.id,
      'accion', v_accion.accion,
      'estado_seguimiento', v_seguimiento.estado,
      'reutilizado', true
    );
  END IF;

  IF p_evidencia_lugar_id IS NOT NULL THEN
    SELECT * INTO v_evidencia
    FROM public.reporte_evidencias
    WHERE id = p_evidencia_lugar_id
      AND reporte_id = p_reporte_id
      AND usuario_id = p_usuario_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'evidencia_seguimiento_no_disponible' USING ERRCODE = 'P0001';
    END IF;

    IF v_evidencia.tipo_hito IS NOT NULL
       AND v_evidencia.tipo_hito <> 'seguimiento_retiro_animal' THEN
      RAISE EXCEPTION 'evidencia_seguimiento_en_conflicto' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.seguimientos_retiro_animal (
    reporte_id,
    resultado_rescate_animal_id,
    registrado_por_id,
    tipo_actor,
    accion,
    folio,
    nombre_servicio,
    destino_informado,
    nota,
    evidencia_lugar_id,
    idempotency_key
  ) VALUES (
    p_reporte_id,
    p_resultado_id,
    p_usuario_id,
    p_tipo_actor,
    p_accion,
    NULLIF(trim(p_folio), ''),
    NULLIF(trim(p_nombre_servicio), ''),
    NULLIF(trim(p_destino_informado), ''),
    NULLIF(trim(p_nota), ''),
    p_evidencia_lugar_id,
    trim(p_idempotency_key)
  )
  RETURNING * INTO v_accion;

  IF p_evidencia_lugar_id IS NOT NULL THEN
    UPDATE public.reporte_evidencias
    SET tipo_hito = 'seguimiento_retiro_animal',
        vinculada_at = COALESCE(vinculada_at, now())
    WHERE id = p_evidencia_lugar_id;
  END IF;

  UPDATE public.seguimientos_fallecimiento_reporte
  SET estado = CASE
        WHEN estado = 'pendiente_voluntario' THEN 'pendiente_asociacion'
        ELSE estado
      END,
      actualizado_at = now()
  WHERE id = v_seguimiento.id
  RETURNING * INTO v_seguimiento;

  INSERT INTO public.historial_reporte (
    reporte_id, usuario_id, tipo_evento, descripcion, datos_extra
  ) VALUES (
    p_reporte_id,
    p_usuario_id,
    'seguimiento_retiro_animal',
    'Se registró una acción de seguimiento para el retiro del animal',
    jsonb_build_object(
      'seguimiento_retiro_id', v_accion.id,
      'resultado_id', p_resultado_id,
      'animal_id', v_resultado.animal_id,
      'tipo_actor', p_tipo_actor,
      'accion', p_accion,
      'tiene_folio', v_accion.folio IS NOT NULL,
      'tiene_evidencia_lugar', p_evidencia_lugar_id IS NOT NULL
    )
  );

  RETURN jsonb_build_object(
    'reporte_id', p_reporte_id,
    'resultado_id', p_resultado_id,
    'seguimiento_retiro_id', v_accion.id,
    'accion', v_accion.accion,
    'estado_seguimiento', v_seguimiento.estado,
    'reutilizado', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_seguimiento_retiro_animal(
  uuid, uuid, uuid, text, uuid, text, text, text, text, text, text, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.registrar_seguimiento_retiro_animal(
  uuid, uuid, uuid, text, uuid, text, text, text, text, text, text, uuid
) TO service_role;

COMMENT ON FUNCTION public.registrar_seguimiento_retiro_animal(
  uuid, uuid, uuid, text, uuid, text, text, text, text, text, text, uuid
) IS
  'Registra una gestión de retiro idempotente sin cerrar ni confirmar automáticamente el seguimiento.';

NOTIFY pgrst, 'reload schema';

COMMIT;
