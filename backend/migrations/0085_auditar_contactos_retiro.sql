-- Registra de forma idempotente cuando un actor autorizado recibe contactos
-- verificados para gestionar el retiro digno.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS historial_contactos_retiro_actor_unico_idx
  ON public.historial_reporte(reporte_id, usuario_id, tipo_evento)
  WHERE tipo_evento = 'contactos_retiro_mostrados';

CREATE OR REPLACE FUNCTION public.registrar_contactos_retiro_mostrados(
  p_reporte_id uuid,
  p_usuario_id uuid,
  p_tipo_actor text,
  p_total_contactos integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF p_tipo_actor NOT IN ('voluntario', 'asociacion', 'administracion') THEN
    RAISE EXCEPTION 'tipo_actor_contactos_invalido';
  END IF;
  IF p_total_contactos < 1 THEN
    RETURN false;
  END IF;

  INSERT INTO public.historial_reporte (
    reporte_id, usuario_id, tipo_evento, descripcion, datos_extra
  ) VALUES (
    p_reporte_id,
    p_usuario_id,
    'contactos_retiro_mostrados',
    'Se mostraron contactos verificados para gestionar el retiro digno',
    jsonb_build_object(
      'tipo_actor', p_tipo_actor,
      'total_contactos', p_total_contactos
    )
  )
  ON CONFLICT (reporte_id, usuario_id, tipo_evento)
    WHERE tipo_evento = 'contactos_retiro_mostrados'
  DO NOTHING;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_contactos_retiro_mostrados(
  uuid, uuid, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_contactos_retiro_mostrados(
  uuid, uuid, text, integer
) TO service_role;

COMMIT;
