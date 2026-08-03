-- Cierra la decisión posterior a una búsqueda sin resultado y permite
-- intentos deliberados sin aceptar duplicados mientras uno siga pendiente.

BEGIN;

CREATE TABLE IF NOT EXISTS public.busquedas_no_localizado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid NOT NULL REFERENCES public.reportes(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  intento integer NOT NULL CHECK (intento > 0),
  comentario text NOT NULL,
  tiempo_busqueda_minutos integer NOT NULL CHECK (tiempo_busqueda_minutos > 0),
  latitud numeric NOT NULL,
  longitud numeric NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'resuelta')),
  decision text CHECK (decision IN (
    'repetir_busqueda', 'ampliar_zona', 'programar_otro_horario',
    'reasignar', 'solicitar_apoyo_regional', 'liberar_voluntario',
    'cerrar_no_localizado'
  )),
  instrucciones text,
  programada_at timestamptz,
  creada_at timestamptz NOT NULL DEFAULT now(),
  resuelta_at timestamptz,
  resuelta_por_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  UNIQUE (reporte_id, intento)
);

CREATE UNIQUE INDEX IF NOT EXISTS busqueda_no_localizado_pendiente_por_reporte
  ON public.busquedas_no_localizado(reporte_id)
  WHERE estado = 'pendiente';

CREATE OR REPLACE FUNCTION public.registrar_busqueda_no_localizado(
  p_reporte_id uuid,
  p_usuario_id uuid,
  p_comentario text,
  p_tiempo_busqueda_minutos integer,
  p_latitud numeric,
  p_longitud numeric,
  p_distancia_reporte_metros numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_reporte public.reportes%ROWTYPE;
  v_intento integer;
  v_busqueda_id uuid;
BEGIN
  SELECT * INTO v_reporte
  FROM public.reportes
  WHERE id = p_reporte_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_reporte.staff_asignado_id IS DISTINCT FROM p_usuario_id
     OR v_reporte.estado_reporte::text <> 'en_camino' THEN
    RAISE EXCEPTION 'busqueda_no_disponible' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.busquedas_no_localizado
    WHERE reporte_id = p_reporte_id AND estado = 'pendiente'
  ) THEN
    RAISE EXCEPTION 'decision_busqueda_pendiente' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(MAX(intento), 0) + 1 INTO v_intento
  FROM public.busquedas_no_localizado
  WHERE reporte_id = p_reporte_id;

  INSERT INTO public.busquedas_no_localizado (
    reporte_id, usuario_id, intento, comentario,
    tiempo_busqueda_minutos, latitud, longitud
  ) VALUES (
    p_reporte_id, p_usuario_id, v_intento, trim(p_comentario),
    p_tiempo_busqueda_minutos, p_latitud, p_longitud
  ) RETURNING id INTO v_busqueda_id;

  INSERT INTO public.historial_reporte (
    reporte_id, usuario_id, tipo_evento, descripcion, datos_extra
  ) VALUES (
    p_reporte_id,
    p_usuario_id,
    'animal_no_localizado',
    'El voluntario terminó una búsqueda sin localizar al animal',
    jsonb_build_object(
      'busqueda_id', v_busqueda_id,
      'intento', v_intento,
      'comentario', trim(p_comentario),
      'tiempo_busqueda_minutos', p_tiempo_busqueda_minutos,
      'latitud', p_latitud,
      'longitud', p_longitud,
      'distancia_reporte_metros', p_distancia_reporte_metros
    )
  );

  RETURN jsonb_build_object(
    'id', v_busqueda_id,
    'reporte_id', p_reporte_id,
    'intento', v_intento,
    'estado', 'pendiente'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolver_busqueda_no_localizado(
  p_reporte_id uuid,
  p_asociacion_id uuid,
  p_usuario_id uuid,
  p_decision text,
  p_instrucciones text DEFAULT NULL,
  p_programada_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_reporte public.reportes%ROWTYPE;
  v_busqueda public.busquedas_no_localizado%ROWTYPE;
  v_estado_cerrado_id public.reporte_estados.id%TYPE;
BEGIN
  IF p_decision NOT IN (
    'repetir_busqueda', 'ampliar_zona', 'programar_otro_horario',
    'reasignar', 'solicitar_apoyo_regional', 'liberar_voluntario',
    'cerrar_no_localizado'
  ) THEN
    RAISE EXCEPTION 'decision_invalida' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_reporte
  FROM public.reportes
  WHERE id = p_reporte_id
  FOR UPDATE;

  IF NOT FOUND OR v_reporte.asociacion_asignada_id IS DISTINCT FROM p_asociacion_id THEN
    RAISE EXCEPTION 'asociacion_no_coordina' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_busqueda
  FROM public.busquedas_no_localizado
  WHERE reporte_id = p_reporte_id AND estado = 'pendiente'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'busqueda_no_disponible' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.busquedas_no_localizado
  SET estado = 'resuelta',
      decision = p_decision,
      instrucciones = NULLIF(trim(p_instrucciones), ''),
      programada_at = p_programada_at,
      resuelta_at = now(),
      resuelta_por_id = p_usuario_id
  WHERE id = v_busqueda.id;

  IF p_decision IN ('reasignar', 'liberar_voluntario') THEN
    UPDATE public.propuestas_asignacion
    SET estado = 'cancelada',
        respondida_at = now(),
        motivo_respuesta = 'La coordinadora liberó al responsable después de una búsqueda sin resultado'
    WHERE reporte_id = p_reporte_id AND estado IN ('activa', 'confirmada');

    UPDATE public.voluntario_ofrecimientos
    SET estado = CASE WHEN estado = 'seleccionado' THEN 'no_seleccionado' ELSE estado END,
        actualizado_at = now()
    WHERE reporte_id = p_reporte_id AND estado IN ('vigente', 'seleccionado');

    UPDATE public.reportes
    SET estado_reporte = 'asignado',
        estado_cobertura = 'abierto',
        staff_asignado_id = NULL,
        confirmacion_voluntario = NULL
    WHERE id = p_reporte_id;
  ELSIF p_decision = 'cerrar_no_localizado' THEN
    SELECT id INTO v_estado_cerrado_id
    FROM public.reporte_estados WHERE clave = 'cerrado' LIMIT 1;

    UPDATE public.propuestas_asignacion
    SET estado = 'cancelada', respondida_at = now(),
        motivo_respuesta = 'Caso cerrado como animal no localizado'
    WHERE reporte_id = p_reporte_id AND estado IN ('activa', 'confirmada');

    UPDATE public.voluntario_ofrecimientos
    SET estado = 'expirado', actualizado_at = now()
    WHERE reporte_id = p_reporte_id AND estado IN ('vigente', 'seleccionado');

    UPDATE public.reportes
    SET estado_reporte = 'cerrado',
        estado_id = v_estado_cerrado_id,
        estado_cobertura = 'finalizado',
        staff_asignado_id = NULL,
        confirmacion_voluntario = NULL
    WHERE id = p_reporte_id;
  END IF;

  INSERT INTO public.historial_reporte (
    reporte_id, usuario_id, tipo_evento, descripcion, datos_extra
  ) VALUES (
    p_reporte_id,
    p_usuario_id,
    'busqueda_no_localizado_resuelta',
    'La asociación coordinadora definió el siguiente paso de la búsqueda',
    jsonb_build_object(
      'busqueda_id', v_busqueda.id,
      'intento', v_busqueda.intento,
      'decision', p_decision,
      'instrucciones', p_instrucciones,
      'programada_at', p_programada_at
    )
  );

  RETURN jsonb_build_object(
    'busqueda_id', v_busqueda.id,
    'intento', v_busqueda.intento,
    'decision', p_decision,
    'estado_reporte', CASE
      WHEN p_decision = 'cerrar_no_localizado' THEN 'cerrado'
      WHEN p_decision IN ('reasignar', 'liberar_voluntario') THEN 'asignado'
      ELSE v_reporte.estado_reporte::text
    END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_busqueda_no_localizado(
  uuid, uuid, text, integer, numeric, numeric, numeric
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolver_busqueda_no_localizado(
  uuid, uuid, uuid, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.registrar_busqueda_no_localizado(
  uuid, uuid, text, integer, numeric, numeric, numeric
) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolver_busqueda_no_localizado(
  uuid, uuid, uuid, text, text, timestamptz
) TO service_role;

COMMIT;
