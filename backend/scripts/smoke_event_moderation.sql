-- Smoke test transaccional de JASS-05 para un entorno NO productivo.
-- Requiere aplicar 0102_eventos_moderacion.sql. Todo se revierte al final.

BEGIN;

DO $$
DECLARE
  v_asociacion_id uuid;
  v_organizador_id uuid;
  v_admin_id uuid;
  v_evento_id uuid := gen_random_uuid();
  v_reporte_id uuid;
  v_clave_reporte text := 'smoke:reportar:' || gen_random_uuid()::text;
  v_clave_suspension text := 'smoke:suspender:' || gen_random_uuid()::text;
  v_clave_restauracion text := 'smoke:restaurar:' || gen_random_uuid()::text;
  v_resultado jsonb;
  v_total integer;
BEGIN
  SELECT asociacion.id, usuario.id
  INTO v_asociacion_id, v_organizador_id
  FROM public.asociaciones asociacion
  JOIN public.usuarios usuario
    ON usuario.asociacion_id = asociacion.id
  LEFT JOIN public.roles rol ON rol.id = usuario.rol_id
  WHERE COALESCE(asociacion.activo, false) = true
    AND COALESCE(asociacion.verificado, false) = true
    AND rol.nombre IN ('asociacion', 'staff')
  ORDER BY asociacion.id, usuario.id
  LIMIT 1;

  SELECT usuario.id INTO v_admin_id
  FROM public.usuarios usuario
  JOIN public.roles rol ON rol.id = usuario.rol_id
  WHERE rol.nombre = 'admin'
    AND COALESCE(rol.activo, false) = true
  ORDER BY usuario.id
  LIMIT 1;

  IF v_asociacion_id IS NULL OR v_organizador_id IS NULL THEN
    RAISE EXCEPTION 'smoke_asociacion_operativa_no_disponible';
  END IF;
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'smoke_administrador_no_disponible';
  END IF;

  INSERT INTO public.eventos_asociacion (
    id, asociacion_id, creado_por_usuario_id,
    responsable_operativo_usuario_id, tipo, titulo, descripcion,
    inicia_at, termina_at, zona_horaria, lugar_nombre, direccion_publica,
    municipio, estado_ubicacion, latitud, longitud, modalidad_acceso,
    especies_objetivo, publico_objetivo, requisitos_asistencia,
    contacto_institucional_nombre, contacto_institucional_email,
    es_gratuito, costo_centavos, estado, version_publica, publicado_at,
    idempotency_key
  ) VALUES (
    v_evento_id, v_asociacion_id, v_organizador_id, v_organizador_id,
    'bienestar_animal', '[SMOKE] Moderacion de evento',
    'Fixture transaccional para validar reportes y moderacion administrativa.',
    now() + interval '2 days', now() + interval '2 days 2 hours',
    'America/Mexico_City', 'Sede de pruebas PawAlert',
    'Direccion publica de pruebas', 'Puebla', 'Puebla', 19.0433, -98.2019,
    'sin_registro', '["perro"]'::jsonb, 'Comunidad de pruebas',
    'No asistir: evento generado por un smoke test.', 'PawAlert QA',
    'qa@pawalert.test', true, 0, 'publicado', 1, now(),
    'smoke:moderacion:' || v_evento_id::text
  );

  v_resultado := public.reportar_evento_asociacion(
    v_evento_id,
    v_admin_id,
    'informacion_falsa',
    'La informacion publicada requiere una revision administrativa.',
    v_clave_reporte
  );
  v_reporte_id := (v_resultado->>'id')::uuid;
  IF v_resultado->>'estado' <> 'pendiente'
     OR (v_resultado->>'reintento')::boolean THEN
    RAISE EXCEPTION 'smoke_reporte_inicial_incorrecto: %', v_resultado;
  END IF;

  v_resultado := public.reportar_evento_asociacion(
    v_evento_id,
    v_admin_id,
    'informacion_falsa',
    'La informacion publicada requiere una revision administrativa.',
    v_clave_reporte
  );
  SELECT count(*) INTO v_total
  FROM public.reportes_evento_asociacion
  WHERE evento_id = v_evento_id;
  IF NOT (v_resultado->>'reintento')::boolean OR v_total <> 1 THEN
    RAISE EXCEPTION 'smoke_reporte_no_idempotente: %, %',
      v_resultado, v_total;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.historial_evento
    WHERE evento_id = v_evento_id
      AND reporte_evento_id = v_reporte_id
      AND tipo_evento = 'evento_reportado'
      AND actor_usuario_id IS NULL
      AND NOT (datos_extra ? 'descripcion')
  ) THEN
    RAISE EXCEPTION 'smoke_privacidad_reportante_incorrecta';
  END IF;

  v_resultado := public.suspender_evento_asociacion_admin(
    v_evento_id,
    v_admin_id,
    'Se suspende temporalmente para revisar la informacion reportada.',
    v_clave_suspension
  );
  IF v_resultado->>'estado' <> 'suspendido_admin'
     OR NOT EXISTS (
       SELECT 1 FROM public.eventos_asociacion
       WHERE id = v_evento_id
         AND estado = 'suspendido_admin'
         AND suspendido_por_usuario_id = v_admin_id
         AND suspendido_at IS NOT NULL
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.reportes_evento_asociacion
       WHERE id = v_reporte_id
         AND estado = 'en_revision'
         AND revisado_por_usuario_id = v_admin_id
     ) THEN
    RAISE EXCEPTION 'smoke_suspension_incorrecta: %', v_resultado;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.notificaciones_push
    WHERE evento_id = v_evento_id
      AND tipo_evento = 'evento_suspendido_admin'
      AND (
        payload ? 'motivo'
        OR payload ? 'motivo_suspension'
        OR payload ? 'reportado_por_usuario_id'
      )
  ) THEN
    RAISE EXCEPTION 'smoke_notificacion_suspension_expone_datos_privados';
  END IF;

  v_resultado := public.suspender_evento_asociacion_admin(
    v_evento_id,
    v_admin_id,
    'Se suspende temporalmente para revisar la informacion reportada.',
    v_clave_suspension
  );
  IF NOT (v_resultado->>'reintento')::boolean THEN
    RAISE EXCEPTION 'smoke_suspension_no_idempotente: %', v_resultado;
  END IF;

  v_resultado := public.restaurar_evento_asociacion_admin(
    v_evento_id,
    v_admin_id,
    'La incidencia fue revisada; la asociacion debe validar y republicar.',
    v_clave_restauracion
  );
  IF v_resultado->>'estado' <> 'pausado'
     OR NOT EXISTS (
       SELECT 1 FROM public.eventos_asociacion
       WHERE id = v_evento_id AND estado = 'pausado'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.reportes_evento_asociacion
       WHERE id = v_reporte_id
         AND estado = 'resuelto'
         AND resuelto_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'smoke_restauracion_incorrecta: %', v_resultado;
  END IF;

  v_resultado := public.restaurar_evento_asociacion_admin(
    v_evento_id,
    v_admin_id,
    'La incidencia fue revisada; la asociacion debe validar y republicar.',
    v_clave_restauracion
  );
  IF NOT (v_resultado->>'reintento')::boolean THEN
    RAISE EXCEPTION 'smoke_restauracion_no_idempotente: %', v_resultado;
  END IF;

  RAISE NOTICE
    'SMOKE JASS-05 COMPLETADO: reporte, privacidad, suspension y restauracion validos';
END;
$$;

ROLLBACK;

SELECT jsonb_build_object(
  'estado', 'completado',
  'pruebas', jsonb_build_array(
    'reporte_idempotente',
    'privacidad_reportante',
    'suspension_admin_con_aviso_seguro',
    'restauracion_a_pausado'
  ),
  'persistencia', 'rollback'
) AS smoke_result;
