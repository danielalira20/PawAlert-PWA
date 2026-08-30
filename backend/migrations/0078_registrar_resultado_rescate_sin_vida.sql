-- Registra de forma atomica el resultado por animal y pausa el reporte solo
-- cuando todas sus fichas, incluidas las de grupo, estan completamente
-- reportadas sin vida. No envia notificaciones ni expone endpoints todavia.

BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_resultado_rescate_sin_vida(
  p_reporte_id uuid,
  p_usuario_id uuid,
  p_animales jsonb,
  p_evidencia_id uuid,
  p_latitud numeric,
  p_longitud numeric,
  p_puede_esperar_seguro boolean,
  p_riesgo_vial boolean DEFAULT false,
  p_riesgo_sanitario boolean DEFAULT false,
  p_identificacion_observada text DEFAULT NULL,
  p_comentario text DEFAULT NULL,
  p_motivo_retiro_seguridad text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_reporte public.reportes%ROWTYPE;
  v_evidencia public.reporte_evidencias%ROWTYPE;
  v_animal public.animal%ROWTYPE;
  v_resultado public.resultados_rescate_animal%ROWTYPE;
  v_item jsonb;
  v_animal_id uuid;
  v_animal_ids uuid[] := ARRAY[]::uuid[];
  v_cantidad integer;
  v_cantidad_anterior integer;
  v_estado_pendiente_id uuid;
  v_todos_reportados boolean := false;
  v_transicion_realizada boolean := false;
  v_resultados jsonb := '[]'::jsonb;
  v_seguimiento public.seguimientos_fallecimiento_reporte%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_animales) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_animales) = 0 THEN
    RAISE EXCEPTION 'animales_requeridos' USING ERRCODE = '22023';
  END IF;

  IF p_latitud IS NULL OR p_latitud < -90 OR p_latitud > 90
     OR p_longitud IS NULL OR p_longitud < -180 OR p_longitud > 180 THEN
    RAISE EXCEPTION 'coordenadas_invalidas' USING ERRCODE = '22023';
  END IF;

  IF p_puede_esperar_seguro IS NULL THEN
    RAISE EXCEPTION 'seguridad_sin_respuesta' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_reporte
  FROM public.reportes
  WHERE id = p_reporte_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reporte_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_reporte.estado_reporte::text NOT IN (
    'en_camino', 'en_atencion', 'pendiente_seguimiento_fallecimiento'
  ) THEN
    RAISE EXCEPTION 'resultado_rescate_no_disponible' USING ERRCODE = 'P0001';
  END IF;

  IF v_reporte.estado_reporte::text <> 'pendiente_seguimiento_fallecimiento'
     AND v_reporte.staff_asignado_id IS DISTINCT FROM p_usuario_id THEN
    RAISE EXCEPTION 'voluntario_no_asignado' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.historial_reporte h
    WHERE h.reporte_id = p_reporte_id
      AND h.usuario_id = p_usuario_id
      AND h.tipo_evento IN (
        'llegada_zona_reporte', 'hito_llegada_zona_reporte'
      )
  ) THEN
    RAISE EXCEPTION 'llegada_zona_requerida' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_evidencia
  FROM public.reporte_evidencias
  WHERE id = p_evidencia_id
    AND reporte_id = p_reporte_id
    AND usuario_id = p_usuario_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'evidencia_no_disponible' USING ERRCODE = 'P0001';
  END IF;

  IF v_evidencia.tipo_hito IS NOT NULL
     AND v_evidencia.tipo_hito <> 'animal_encontrado_sin_vida' THEN
    RAISE EXCEPTION 'evidencia_vinculada_otro_hito' USING ERRCODE = 'P0001';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_animales)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR NULLIF(v_item->>'animal_id', '') IS NULL
       OR COALESCE(v_item->>'cantidad_reportada', '') !~ '^[1-9][0-9]*$' THEN
      RAISE EXCEPTION 'animal_resultado_invalido' USING ERRCODE = '22023';
    END IF;

    v_animal_id := (v_item->>'animal_id')::uuid;
    v_cantidad := (v_item->>'cantidad_reportada')::integer;

    IF v_animal_id = ANY(v_animal_ids) THEN
      RAISE EXCEPTION 'animal_duplicado' USING ERRCODE = '22023';
    END IF;
    v_animal_ids := array_append(v_animal_ids, v_animal_id);

    SELECT * INTO v_animal
    FROM public.animal
    WHERE id = v_animal_id
      AND reporte_id = p_reporte_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'animal_no_pertenece_reporte' USING ERRCODE = '22023';
    END IF;

    IF v_cantidad > v_animal.cantidad
       OR (NOT v_animal.es_grupo AND v_cantidad <> 1) THEN
      RAISE EXCEPTION 'cantidad_animal_invalida' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_resultado
    FROM public.resultados_rescate_animal
    WHERE animal_id = v_animal_id
    FOR UPDATE;

    IF FOUND THEN
      IF v_resultado.cantidad_reportada = v_cantidad
         AND v_resultado.evidencia_id = p_evidencia_id
         AND v_resultado.reportado_por_id = p_usuario_id
         AND v_resultado.latitud = p_latitud
         AND v_resultado.longitud = p_longitud THEN
        v_resultados := v_resultados || jsonb_build_array(
          jsonb_build_object(
            'resultado_id', v_resultado.id,
            'animal_id', v_animal_id,
            'cantidad_reportada', v_resultado.cantidad_reportada,
            'reutilizado', true
          )
        );
        CONTINUE;
      END IF;

      IF v_reporte.estado_reporte::text = 'pendiente_seguimiento_fallecimiento' THEN
        RAISE EXCEPTION 'resultado_no_modificable' USING ERRCODE = 'P0001';
      END IF;

      IF v_cantidad <= v_resultado.cantidad_reportada THEN
        RAISE EXCEPTION 'resultado_previo_en_conflicto' USING ERRCODE = 'P0001';
      END IF;

      v_cantidad_anterior := v_resultado.cantidad_reportada;

      UPDATE public.resultados_rescate_animal
      SET reportado_por_id = p_usuario_id,
          evidencia_id = p_evidencia_id,
          estado = 'sin_vida_reportado',
          cantidad_reportada = v_cantidad,
          latitud = p_latitud,
          longitud = p_longitud,
          puede_esperar_seguro = p_puede_esperar_seguro,
          riesgo_vial = COALESCE(p_riesgo_vial, false),
          riesgo_sanitario = COALESCE(p_riesgo_sanitario, false),
          identificacion_observada = NULLIF(trim(p_identificacion_observada), ''),
          comentario = NULLIF(trim(p_comentario), ''),
          motivo_retiro_seguridad = NULLIF(trim(p_motivo_retiro_seguridad), ''),
          revisado_por_id = NULL,
          revision_notas = NULL,
          reportado_at = now(),
          revisado_at = NULL,
          actualizado_at = now()
      WHERE id = v_resultado.id
      RETURNING * INTO v_resultado;
    ELSE
      IF v_reporte.estado_reporte::text = 'pendiente_seguimiento_fallecimiento' THEN
        RAISE EXCEPTION 'resultado_faltante_en_reintento' USING ERRCODE = 'P0001';
      END IF;

      v_cantidad_anterior := 0;

      INSERT INTO public.resultados_rescate_animal (
        reporte_id,
        animal_id,
        reportado_por_id,
        evidencia_id,
        cantidad_reportada,
        latitud,
        longitud,
        puede_esperar_seguro,
        riesgo_vial,
        riesgo_sanitario,
        identificacion_observada,
        comentario,
        motivo_retiro_seguridad
      ) VALUES (
        p_reporte_id,
        v_animal_id,
        p_usuario_id,
        p_evidencia_id,
        v_cantidad,
        p_latitud,
        p_longitud,
        p_puede_esperar_seguro,
        COALESCE(p_riesgo_vial, false),
        COALESCE(p_riesgo_sanitario, false),
        NULLIF(trim(p_identificacion_observada), ''),
        NULLIF(trim(p_comentario), ''),
        NULLIF(trim(p_motivo_retiro_seguridad), '')
      )
      RETURNING * INTO v_resultado;
    END IF;

    INSERT INTO public.historial_reporte (
      reporte_id, usuario_id, tipo_evento, descripcion, datos_extra
    ) VALUES (
      p_reporte_id,
      p_usuario_id,
      'animal_encontrado_sin_vida',
      'El voluntario reportó un animal aparentemente sin vida',
      jsonb_build_object(
        'resultado_id', v_resultado.id,
        'animal_id', v_animal_id,
        'cantidad_anterior', v_cantidad_anterior,
        'cantidad_reportada', v_cantidad,
        'cantidad_total_ficha', v_animal.cantidad,
        'evidencia_id', p_evidencia_id,
        'riesgo_vial', COALESCE(p_riesgo_vial, false),
        'riesgo_sanitario', COALESCE(p_riesgo_sanitario, false),
        'puede_esperar_seguro', p_puede_esperar_seguro
      )
    );

    v_resultados := v_resultados || jsonb_build_array(
      jsonb_build_object(
        'resultado_id', v_resultado.id,
        'animal_id', v_animal_id,
        'cantidad_reportada', v_resultado.cantidad_reportada,
        'reutilizado', false
      )
    );
  END LOOP;

  UPDATE public.reporte_evidencias
  SET tipo_hito = 'animal_encontrado_sin_vida',
      vinculada_at = COALESCE(vinculada_at, now())
  WHERE id = p_evidencia_id;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.animal a
    LEFT JOIN public.resultados_rescate_animal rr
      ON rr.animal_id = a.id
    WHERE a.reporte_id = p_reporte_id
      AND (
        rr.id IS NULL
        OR rr.estado NOT IN ('sin_vida_reportado', 'sin_vida_confirmado')
        OR rr.cantidad_reportada < a.cantidad
      )
  ) INTO v_todos_reportados;

  IF v_todos_reportados
     AND v_reporte.estado_reporte::text <> 'pendiente_seguimiento_fallecimiento' THEN
    SELECT id INTO v_estado_pendiente_id
    FROM public.reporte_estados
    WHERE clave = 'pendiente_seguimiento_fallecimiento'
    LIMIT 1;

    IF v_estado_pendiente_id IS NULL THEN
      RAISE EXCEPTION 'estado_seguimiento_no_encontrado' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.propuestas_asignacion
    SET estado = 'cancelada',
        respondida_at = COALESCE(respondida_at, now()),
        motivo_respuesta = 'Todos los animales fueron reportados sin vida'
    WHERE reporte_id = p_reporte_id
      AND estado IN ('activa', 'confirmada');

    UPDATE public.voluntario_ofrecimientos
    SET estado = 'expirado',
        actualizado_at = now()
    WHERE reporte_id = p_reporte_id
      AND estado IN ('vigente', 'seleccionado');

    UPDATE public.reportes
    SET estado_reporte = 'pendiente_seguimiento_fallecimiento',
        estado_id = v_estado_pendiente_id,
        estado_cobertura = 'finalizado',
        staff_asignado_id = NULL,
        voluntario_id = NULL,
        confirmacion_voluntario = NULL,
        candidatos_presentados_at = NULL,
        urgency_score = NULL,
        urgency_nivel = NULL,
        urgency_calculado_at = NULL,
        urgency_proximo_recalculo_at = NULL,
        urgency_excluido = true,
        urgency_razones_exclusion = jsonb_build_array(
          jsonb_build_object('codigo', 'todos_animales_sin_vida')
        ),
        urgency_score_operativo = NULL,
        urgency_nivel_operativo = NULL,
        urgency_operativo_actualizado_at = NULL,
        updated_at = now()
    WHERE id = p_reporte_id;

    INSERT INTO public.seguimientos_fallecimiento_reporte (
      reporte_id,
      asociacion_coordinadora_id,
      estado,
      iniciado_at,
      asociacion_deadline_at,
      administracion_deadline_at
    ) VALUES (
      p_reporte_id,
      v_reporte.asociacion_asignada_id,
      'pendiente_voluntario',
      now(),
      now() + interval '24 hours',
      now() + interval '48 hours'
    )
    ON CONFLICT (reporte_id) DO UPDATE
    SET asociacion_coordinadora_id = EXCLUDED.asociacion_coordinadora_id,
        estado = 'pendiente_voluntario',
        iniciado_at = EXCLUDED.iniciado_at,
        asociacion_deadline_at = EXCLUDED.asociacion_deadline_at,
        administracion_deadline_at = EXCLUDED.administracion_deadline_at,
        resultado_final = NULL,
        conclusion_rescate = NULL,
        cerrado_por_id = NULL,
        cerrado_at = NULL,
        actualizado_at = now()
    RETURNING * INTO v_seguimiento;

    INSERT INTO public.historial_reporte (
      reporte_id, usuario_id, tipo_evento, descripcion, datos_extra
    ) VALUES (
      p_reporte_id,
      p_usuario_id,
      'reporte_pendiente_seguimiento_fallecimiento',
      'Todos los animales fueron reportados sin vida; inició el seguimiento',
      jsonb_build_object(
        'seguimiento_id', v_seguimiento.id,
        'asociacion_coordinadora_id', v_reporte.asociacion_asignada_id,
        'asociacion_deadline_at', v_seguimiento.asociacion_deadline_at,
        'administracion_deadline_at', v_seguimiento.administracion_deadline_at
      )
    );

    v_transicion_realizada := true;
  ELSIF NOT v_todos_reportados THEN
    UPDATE public.reportes
    SET urgency_proximo_recalculo_at = now(),
        updated_at = now()
    WHERE id = p_reporte_id;
  END IF;

  IF v_todos_reportados AND v_seguimiento.id IS NULL THEN
    SELECT * INTO v_seguimiento
    FROM public.seguimientos_fallecimiento_reporte
    WHERE reporte_id = p_reporte_id;
  END IF;

  RETURN jsonb_build_object(
    'reporte_id', p_reporte_id,
    'resultados', v_resultados,
    'todos_animales_reportados', v_todos_reportados,
    'transicion_realizada', v_transicion_realizada,
    'estado_reporte', CASE
      WHEN v_todos_reportados THEN 'pendiente_seguimiento_fallecimiento'
      ELSE v_reporte.estado_reporte::text
    END,
    'seguimiento_id', v_seguimiento.id,
    'asociacion_deadline_at', v_seguimiento.asociacion_deadline_at,
    'administracion_deadline_at', v_seguimiento.administracion_deadline_at,
    'requiere_recalculo_urgency', NOT v_todos_reportados
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_resultado_rescate_sin_vida(
  uuid, uuid, jsonb, uuid, numeric, numeric, boolean,
  boolean, boolean, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.registrar_resultado_rescate_sin_vida(
  uuid, uuid, jsonb, uuid, numeric, numeric, boolean,
  boolean, boolean, text, text, text
) TO service_role;

COMMENT ON FUNCTION public.registrar_resultado_rescate_sin_vida(
  uuid, uuid, jsonb, uuid, numeric, numeric, boolean,
  boolean, boolean, text, text, text
) IS
  'Registra resultados por animal y pausa cobertura solo cuando todas las cantidades del reporte estan completas.';

NOTIFY pgrst, 'reload schema';

COMMIT;
