-- Corrige la causa raíz de los errores geográficos durante la reserva.
--
-- Las RPC de cobertura se crearon con search_path = public, pero en Supabase
-- PostGIS normalmente vive en extensions. Los triggers ejecutados por esas
-- RPC heredaban el search_path y no podían resolver ST_SetSRID ni otras
-- funciones de PostGIS.

BEGIN;

DO $migration$
DECLARE
  v_postgis_schema name;
  v_trigger record;
  v_triggers_actualizados integer := 0;
BEGIN
  SELECT n.nspname
  INTO v_postgis_schema
  FROM pg_extension AS e
  JOIN pg_namespace AS n ON n.oid = e.extnamespace
  WHERE e.extname = 'postgis';

  IF v_postgis_schema IS NULL THEN
    RAISE EXCEPTION 'La extensión PostGIS no está instalada';
  END IF;

  -- La RPC es SECURITY DEFINER; se conserva public al inicio para resolver
  -- las tablas de la aplicación y se agrega únicamente el esquema real de
  -- PostGIS.
  EXECUTE format(
    'ALTER FUNCTION public.reservar_cobertura_reporte(
       uuid, uuid, uuid, uuid, uuid, text, timestamptz
     ) SET search_path = public, %I',
    v_postgis_schema
  );

  EXECUTE format(
    'ALTER FUNCTION public.responder_propuesta_cobertura(
       uuid, uuid, boolean, text
     ) SET search_path = public, %I',
    v_postgis_schema
  );

  -- Algunos triggers antiguos fijan su propio search_path y otros heredan el
  -- de la RPC. Se cubren ambos casos en las tablas tocadas por la transacción.
  FOR v_trigger IN
    SELECT DISTINCT
      p.oid::regprocedure AS firma
    FROM pg_trigger AS t
    JOIN pg_class AS c ON c.oid = t.tgrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    JOIN pg_proc AS p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal
      AND n.nspname = 'public'
      AND c.relname IN (
        'reportes',
        'propuestas_asignacion',
        'voluntario_ofrecimientos',
        'historial_reporte'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path = public, %I',
      v_trigger.firma,
      v_postgis_schema
    );
    v_triggers_actualizados := v_triggers_actualizados + 1;
  END LOOP;

  -- Verificación dentro de la misma transacción: usa exactamente argumentos
  -- numeric y una llamada no calificada, como los triggers históricos.
  PERFORM set_config(
    'search_path',
    format('public, %I', v_postgis_schema),
    true
  );
  PERFORM st_setsrid(st_point(0::numeric, 0::numeric), 4326);

  RAISE NOTICE
    'Search path PostGIS corregido; % trigger(s) actualizado(s)',
    v_triggers_actualizados;
END;
$migration$;

COMMIT;
