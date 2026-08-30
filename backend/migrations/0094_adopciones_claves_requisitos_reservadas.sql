-- Evita que una pregunta adicional reutilice la clave de un requisito base.
-- Las respuestas se versionan por clave, por lo que una colision volveria
-- ambiguo el formulario que vio la persona solicitante.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.preguntas_requisito_adopcion pregunta
    JOIN public.plantillas_requisitos_adopcion plantilla
      ON plantilla.id = pregunta.plantilla_id
    JOIN public.requisitos_base_adopcion requisito
      ON requisito.version = plantilla.requisitos_base_version
     AND requisito.clave = pregunta.clave
     AND requisito.activo = true
  ) THEN
    RAISE EXCEPTION 'plantillas_adopcion_con_claves_base_duplicadas';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_clave_personalizada_adopcion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_version_base text;
BEGIN
  SELECT requisitos_base_version
  INTO v_version_base
  FROM public.plantillas_requisitos_adopcion
  WHERE id = NEW.plantilla_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'plantilla_requisitos_adopcion_no_encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.requisitos_base_adopcion requisito
    WHERE requisito.version = v_version_base
      AND requisito.clave = NEW.clave
      AND requisito.activo = true
  ) THEN
    RAISE EXCEPTION 'clave_requisito_adopcion_reservada'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preguntas_requisito_adopcion_clave_reservada
  ON public.preguntas_requisito_adopcion;

CREATE TRIGGER preguntas_requisito_adopcion_clave_reservada
BEFORE INSERT OR UPDATE OF clave, plantilla_id
ON public.preguntas_requisito_adopcion
FOR EACH ROW EXECUTE FUNCTION public.validar_clave_personalizada_adopcion();

REVOKE ALL ON FUNCTION public.validar_clave_personalizada_adopcion()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.validar_clave_personalizada_adopcion()
TO service_role;

COMMENT ON FUNCTION public.validar_clave_personalizada_adopcion() IS
  'Reserva las claves de PawAlert para que el snapshot tenga una pregunta unica por clave.';

COMMIT;

NOTIFY pgrst, 'reload schema';
