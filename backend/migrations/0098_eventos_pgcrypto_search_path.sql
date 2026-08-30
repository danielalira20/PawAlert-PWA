-- Corrige la resolucion de pgcrypto en las operaciones de eventos que
-- calculan hashes de idempotencia. En Supabase, pgcrypto vive en el esquema
-- `extensions`, mientras que 0097 restringe correctamente el search_path de
-- sus funciones SECURITY DEFINER.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('extensions.digest(text,text)') IS NULL THEN
    RAISE EXCEPTION 'pgcrypto_digest_no_disponible_en_extensions';
  END IF;
END;
$$;

ALTER FUNCTION public.crear_borrador_evento_asociacion(
  uuid, uuid, jsonb, text
) SET search_path = public, extensions, pg_temp;

ALTER FUNCTION public.actualizar_evento_asociacion(
  uuid, uuid, uuid, jsonb, text
) SET search_path = public, extensions, pg_temp;

ALTER FUNCTION public.pausar_evento_asociacion(
  uuid, uuid, uuid, text, text
) SET search_path = public, extensions, pg_temp;

ALTER FUNCTION public.cancelar_evento_asociacion(
  uuid, uuid, uuid, text, text
) SET search_path = public, extensions, pg_temp;

COMMIT;

NOTIFY pgrst, 'reload schema';
