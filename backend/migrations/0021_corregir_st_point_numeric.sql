-- Compatibilidad para funciones y triggers históricos que construyen puntos
-- PostGIS directamente desde columnas numeric.
--
-- PostGIS expone ST_Point(double precision, double precision), pero PostgreSQL
-- no convierte numeric de forma implícita al resolver esa función. Esto hacía
-- que reservar una cobertura fallara al actualizar reportes, aun cuando la
-- propuesta y el voluntario fueran válidos.

BEGIN;

DO $migration$
DECLARE
  v_postgis_schema name;
BEGIN
  SELECT n.nspname
  INTO v_postgis_schema
  FROM pg_extension AS e
  JOIN pg_namespace AS n ON n.oid = e.extnamespace
  WHERE e.extname = 'postgis';

  IF v_postgis_schema IS NULL THEN
    RAISE EXCEPTION 'La extensión PostGIS no está instalada';
  END IF;

  -- Sobrecarga junto a PostGIS: cubre funciones cuyo search_path apunta
  -- directamente al esquema de la extensión.
  EXECUTE format(
    $sql$
      CREATE OR REPLACE FUNCTION %1$I.st_point(numeric, numeric)
      RETURNS %1$I.geometry
      LANGUAGE sql
      IMMUTABLE
      PARALLEL SAFE
      STRICT
      AS $function$
        SELECT %1$I.st_point($1::double precision, $2::double precision)
      $function$
    $sql$,
    v_postgis_schema
  );

  -- Supabase suele ejecutar triggers con public en el search_path. Cuando
  -- PostGIS vive en extensions, esta segunda sobrecarga evita depender de la
  -- configuración global del search_path.
  IF v_postgis_schema <> 'public' THEN
    EXECUTE format(
      $sql$
        CREATE OR REPLACE FUNCTION public.st_point(numeric, numeric)
        RETURNS %1$I.geometry
        LANGUAGE sql
        IMMUTABLE
        PARALLEL SAFE
        STRICT
        AS $function$
          SELECT %1$I.st_point($1::double precision, $2::double precision)
        $function$
      $sql$,
      v_postgis_schema
    );
  END IF;
END;
$migration$;

COMMENT ON FUNCTION public.st_point(numeric, numeric) IS
  'Convierte coordenadas numeric a double precision para compatibilidad con PostGIS.';

COMMIT;
