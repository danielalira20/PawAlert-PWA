-- Hace atómicos e idempotentes los ofrecimientos de voluntariado externo.
-- Corrige además el acceso: las escrituras se ejecutan únicamente desde el
-- backend con service_role, nunca con la llave pública.

BEGIN;

CREATE OR REPLACE FUNCTION public.crear_ofrecimiento_externo(
  p_reporte_id uuid,
  p_voluntario_id uuid,
  p_usuario_id uuid,
  p_compatibilidad numeric,
  p_distancia_km numeric,
  p_capacidad_disponible integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_reporte public.reportes%ROWTYPE;
  v_ofrecimiento public.voluntario_ofrecimientos%ROWTYPE;
BEGIN
  SELECT *
  INTO v_reporte
  FROM public.reportes
  WHERE id = p_reporte_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reporte_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.voluntarios v
    JOIN public.usuarios u ON u.id = v.usuario_id
    JOIN public.roles r ON r.id = u.rol_id
    WHERE v.id = p_voluntario_id
      AND v.usuario_id = p_usuario_id
      AND v.estado = 'activo_nivel_2'
      AND r.nombre = 'voluntario_externo'
  ) THEN
    RAISE EXCEPTION 'voluntario_externo_no_elegible' USING ERRCODE = '42501';
  END IF;

  -- Una repetición por doble toque o reintento de red devuelve el mismo
  -- ofrecimiento y no duplica el historial.
  SELECT *
  INTO v_ofrecimiento
  FROM public.voluntario_ofrecimientos
  WHERE reporte_id = p_reporte_id
    AND voluntario_id = p_voluntario_id
    AND estado IN ('vigente', 'seleccionado')
  LIMIT 1;

  IF FOUND THEN
    RETURN to_jsonb(v_ofrecimiento);
  END IF;

  IF v_reporte.estado_reporte::text <> 'asignado'
     OR v_reporte.asociacion_asignada_id IS NULL
     OR v_reporte.estado_cobertura IS DISTINCT FROM 'abierto'
     OR v_reporte.staff_asignado_id IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM public.propuestas_asignacion
       WHERE reporte_id = p_reporte_id
         AND estado = 'activa'
     ) THEN
    RAISE EXCEPTION 'caso_no_disponible' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.voluntario_ofrecimientos (
    reporte_id,
    voluntario_id,
    estado,
    compatibilidad,
    distancia_km,
    capacidad_disponible
  ) VALUES (
    p_reporte_id,
    p_voluntario_id,
    'vigente',
    p_compatibilidad,
    p_distancia_km,
    greatest(p_capacidad_disponible, 0)
  )
  RETURNING * INTO v_ofrecimiento;

  INSERT INTO public.historial_reporte (
    reporte_id, usuario_id, tipo_evento, descripcion, datos_extra
  ) VALUES (
    p_reporte_id,
    p_usuario_id,
    'voluntario_se_ofrece',
    'Un voluntario externo verificado se ofreció para ayudar',
    jsonb_build_object(
      'voluntario_id', p_voluntario_id,
      'distancia_km', p_distancia_km
    )
  );

  RETURN to_jsonb(v_ofrecimiento);
END;
$function$;

CREATE OR REPLACE FUNCTION public.retirar_ofrecimiento_externo(
  p_reporte_id uuid,
  p_voluntario_id uuid,
  p_usuario_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_ofrecimiento public.voluntario_ofrecimientos%ROWTYPE;
BEGIN
  -- Mantiene el mismo orden de bloqueo que la selección de cobertura.
  PERFORM 1
  FROM public.reportes
  WHERE id = p_reporte_id
  FOR UPDATE;

  SELECT *
  INTO v_ofrecimiento
  FROM public.voluntario_ofrecimientos
  WHERE reporte_id = p_reporte_id
    AND voluntario_id = p_voluntario_id
    AND estado = 'vigente'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ofrecimiento_no_retirable' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.voluntario_ofrecimientos
  SET estado = 'retirado',
      actualizado_at = now()
  WHERE id = v_ofrecimiento.id
  RETURNING * INTO v_ofrecimiento;

  INSERT INTO public.historial_reporte (
    reporte_id, usuario_id, tipo_evento, descripcion, datos_extra
  ) VALUES (
    p_reporte_id,
    p_usuario_id,
    'voluntario_retira_ofrecimiento',
    'El voluntario externo retiró su ofrecimiento',
    jsonb_build_object('voluntario_id', p_voluntario_id)
  );

  RETURN to_jsonb(v_ofrecimiento);
END;
$function$;

REVOKE ALL ON FUNCTION public.crear_ofrecimiento_externo(
  uuid, uuid, uuid, numeric, numeric, integer
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.retirar_ofrecimiento_externo(
  uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.crear_ofrecimiento_externo(
  uuid, uuid, uuid, numeric, numeric, integer
) TO service_role;

GRANT EXECUTE ON FUNCTION public.retirar_ofrecimiento_externo(
  uuid, uuid, uuid
) TO service_role;

COMMIT;
