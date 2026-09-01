-- Smoke test transaccional de JASS-04 para un entorno NO productivo.
-- Crea fixtures efimeros, ejecuta las RPC reales y revierte todo al final.
-- Si alguna regla falla, PostgreSQL aborta el bloque con `smoke_*`.

BEGIN;

DO $$
DECLARE
  v_asociacion_id uuid;
  v_usuario_id uuid;
  v_run_id uuid;
  v_evento_recordatorio_id uuid := gen_random_uuid();
  v_evento_finalizacion_id uuid := gen_random_uuid();
  v_evento_archivo_id uuid := gen_random_uuid();
  v_resultado jsonb;
  v_total integer;
BEGIN
  SELECT asociacion.id, usuario.id
  INTO v_asociacion_id, v_usuario_id
  FROM public.asociaciones asociacion
  JOIN public.usuarios usuario
    ON usuario.asociacion_id = asociacion.id
  LEFT JOIN public.roles rol ON rol.id = usuario.rol_id
  WHERE COALESCE(asociacion.activo, false) = true
    AND COALESCE(asociacion.verificado, false) = true
    AND rol.nombre IN ('asociacion', 'staff')
  ORDER BY asociacion.id, usuario.id
  LIMIT 1;

  IF v_asociacion_id IS NULL OR v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'smoke_asociacion_operativa_no_disponible';
  END IF;

  INSERT INTO public.eventos_asociacion (
    id,
    asociacion_id,
    creado_por_usuario_id,
    responsable_operativo_usuario_id,
    tipo,
    titulo,
    descripcion,
    inicia_at,
    termina_at,
    zona_horaria,
    lugar_nombre,
    direccion_publica,
    municipio,
    estado_ubicacion,
    latitud,
    longitud,
    modalidad_acceso,
    especies_objetivo,
    publico_objetivo,
    requisitos_asistencia,
    contacto_institucional_nombre,
    contacto_institucional_email,
    es_gratuito,
    costo_centavos,
    estado,
    version_publica,
    publicado_at,
    finalizado_at,
    idempotency_key
  ) VALUES
  (
    v_evento_recordatorio_id,
    v_asociacion_id,
    v_usuario_id,
    v_usuario_id,
    'bienestar_animal',
    '[SMOKE] Recordatorio de evento',
    'Fixture transaccional para validar el recordatorio de 24 horas.',
    now() + interval '12 hours',
    now() + interval '14 hours',
    'America/Mexico_City',
    'Sede de pruebas PawAlert',
    'Direccion publica de pruebas',
    'Puebla',
    'Puebla',
    19.0433,
    -98.2019,
    'sin_registro',
    '["perro"]'::jsonb,
    'Comunidad de pruebas',
    'No asistir: evento generado por un smoke test.',
    'PawAlert QA',
    'qa@pawalert.test',
    true,
    0,
    'publicado',
    1,
    now() - interval '1 day',
    NULL,
    'smoke:recordatorio:' || v_evento_recordatorio_id::text
  ),
  (
    v_evento_finalizacion_id,
    v_asociacion_id,
    v_usuario_id,
    v_usuario_id,
    'bienestar_animal',
    '[SMOKE] Finalizacion de evento',
    'Fixture transaccional para validar la finalizacion automatica.',
    now() - interval '2 hours',
    now() - interval '1 hour',
    'America/Mexico_City',
    'Sede de pruebas PawAlert',
    'Direccion publica de pruebas',
    'Puebla',
    'Puebla',
    19.0433,
    -98.2019,
    'sin_registro',
    '["perro"]'::jsonb,
    'Comunidad de pruebas',
    'No asistir: evento generado por un smoke test.',
    'PawAlert QA',
    'qa@pawalert.test',
    true,
    0,
    'publicado',
    1,
    now() - interval '1 day',
    NULL,
    'smoke:finalizacion:' || v_evento_finalizacion_id::text
  ),
  (
    v_evento_archivo_id,
    v_asociacion_id,
    v_usuario_id,
    v_usuario_id,
    'bienestar_animal',
    '[SMOKE] Archivo de evento',
    'Fixture transaccional para validar el archivado automatico.',
    now() - interval '32 days',
    now() - interval '31 days',
    'America/Mexico_City',
    'Sede de pruebas PawAlert',
    'Direccion publica de pruebas',
    'Puebla',
    'Puebla',
    19.0433,
    -98.2019,
    'sin_registro',
    '["perro"]'::jsonb,
    'Comunidad de pruebas',
    'No asistir: evento generado por un smoke test.',
    'PawAlert QA',
    'qa@pawalert.test',
    true,
    0,
    'finalizado',
    1,
    now() - interval '32 days',
    now() - interval '31 days',
    'smoke:archivo:' || v_evento_archivo_id::text
  );

  INSERT INTO public.eventos_guardados (
    evento_id, usuario_id, idempotency_key
  ) VALUES
    (
      v_evento_recordatorio_id,
      v_usuario_id,
      'smoke:guardar:recordatorio:' || v_evento_recordatorio_id::text
    ),
    (
      v_evento_finalizacion_id,
      v_usuario_id,
      'smoke:guardar:finalizacion:' || v_evento_finalizacion_id::text
    );

  INSERT INTO public.operaciones_modulo_runs (tipo_job)
  VALUES ('ciclo_vida_eventos')
  RETURNING id INTO v_run_id;

  PERFORM *
  FROM public.claim_due_eventos_asociacion(v_run_id, 100);

  IF NOT EXISTS (
    SELECT 1
    FROM public.eventos_asociacion_claims
    WHERE run_id = v_run_id
      AND evento_id = v_evento_recordatorio_id
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.eventos_asociacion_claims
    WHERE run_id = v_run_id
      AND evento_id = v_evento_finalizacion_id
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.eventos_asociacion_claims
    WHERE run_id = v_run_id
      AND evento_id = v_evento_archivo_id
  ) THEN
    RAISE EXCEPTION 'smoke_claims_incompletos';
  END IF;

  v_resultado := public.procesar_ciclo_vida_evento_asociacion(
    v_evento_recordatorio_id, v_run_id
  );
  IF v_resultado->>'accion' <> 'recordatorio_24h'
     OR (v_resultado->>'notificaciones_encoladas')::integer <> 1 THEN
    RAISE EXCEPTION 'smoke_recordatorio_resultado_incorrecto: %', v_resultado;
  END IF;

  SELECT count(*) INTO v_total
  FROM public.notificaciones_push
  WHERE evento_id = v_evento_recordatorio_id
    AND usuario_id = v_usuario_id
    AND tipo_evento = 'evento_recordatorio_24h'
    AND payload @> '{"reserva_cupo": false}'::jsonb;
  IF v_total <> 1 THEN
    RAISE EXCEPTION 'smoke_recordatorio_outbox_incorrecto: %', v_total;
  END IF;

  -- Reintentar con el mismo claim no debe duplicar el recordatorio.
  v_resultado := public.procesar_ciclo_vida_evento_asociacion(
    v_evento_recordatorio_id, v_run_id
  );
  SELECT count(*) INTO v_total
  FROM public.notificaciones_push
  WHERE evento_id = v_evento_recordatorio_id
    AND usuario_id = v_usuario_id
    AND tipo_evento = 'evento_recordatorio_24h';
  IF v_resultado->>'accion' <> 'omitido' OR v_total <> 1 THEN
    RAISE EXCEPTION 'smoke_recordatorio_no_idempotente: %, %',
      v_resultado, v_total;
  END IF;

  v_resultado := public.procesar_ciclo_vida_evento_asociacion(
    v_evento_finalizacion_id, v_run_id
  );
  IF v_resultado->>'accion' <> 'finalizado'
     OR (v_resultado->>'notificaciones_encoladas')::integer <> 1 THEN
    RAISE EXCEPTION 'smoke_finalizacion_resultado_incorrecto: %', v_resultado;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.eventos_asociacion
    WHERE id = v_evento_finalizacion_id
      AND estado = 'finalizado'
      AND finalizado_at IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.historial_evento
    WHERE evento_id = v_evento_finalizacion_id
      AND tipo_evento = 'evento_finalizado'
      AND estado_anterior = 'publicado'
      AND estado_nuevo = 'finalizado'
  ) THEN
    RAISE EXCEPTION 'smoke_finalizacion_estado_o_historial_incorrecto';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.notificaciones_push
  WHERE evento_id = v_evento_finalizacion_id
    AND usuario_id = v_usuario_id
    AND tipo_evento = 'evento_finalizado';
  IF v_total <> 1 THEN
    RAISE EXCEPTION 'smoke_finalizacion_outbox_incorrecto: %', v_total;
  END IF;

  -- Reintentar no vuelve a finalizar ni duplica el aviso.
  v_resultado := public.procesar_ciclo_vida_evento_asociacion(
    v_evento_finalizacion_id, v_run_id
  );
  SELECT count(*) INTO v_total
  FROM public.notificaciones_push
  WHERE evento_id = v_evento_finalizacion_id
    AND usuario_id = v_usuario_id
    AND tipo_evento = 'evento_finalizado';
  IF v_resultado->>'accion' <> 'omitido' OR v_total <> 1 THEN
    RAISE EXCEPTION 'smoke_finalizacion_no_idempotente: %, %',
      v_resultado, v_total;
  END IF;

  v_resultado := public.procesar_ciclo_vida_evento_asociacion(
    v_evento_archivo_id, v_run_id
  );
  IF v_resultado->>'accion' <> 'archivado'
     OR (v_resultado->>'notificaciones_encoladas')::integer <> 0 THEN
    RAISE EXCEPTION 'smoke_archivo_resultado_incorrecto: %', v_resultado;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.eventos_asociacion
    WHERE id = v_evento_archivo_id
      AND estado = 'archivado'
      AND archivado_at IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.historial_evento
    WHERE evento_id = v_evento_archivo_id
      AND tipo_evento = 'evento_archivado'
      AND estado_anterior = 'finalizado'
      AND estado_nuevo = 'archivado'
  ) THEN
    RAISE EXCEPTION 'smoke_archivo_estado_o_historial_incorrecto';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.notificaciones_push
  WHERE evento_id = v_evento_archivo_id;
  IF v_total <> 0 THEN
    RAISE EXCEPTION 'smoke_archivo_genero_notificacion: %', v_total;
  END IF;

  RAISE NOTICE
    'SMOKE JASS-04 COMPLETADO: recordatorio, finalizacion, archivo e idempotencia validos';
END;
$$;

ROLLBACK;

SELECT jsonb_build_object(
  'estado', 'completado',
  'pruebas', jsonb_build_array(
    'claim_concurrencia_segura',
    'recordatorio_24h_idempotente',
    'finalizacion_con_aviso_unico',
    'archivo_sin_notificacion'
  ),
  'persistencia', 'rollback'
) AS smoke_result;
