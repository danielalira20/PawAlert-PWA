-- FRONT13/14/15/16 + BACK07: un aliado registra un lote físico de forma
-- independiente (ya no depende de una contribución 1:1 previa) y ese lote
-- se puede repartir entre varias asociaciones — cada una con su propia
-- invitación, su propio QR de recepción (con vigencia) y su propia
-- contribución. Ver TODO en backend/app/models/red_aliados.py.

BEGIN;

-- 1. lotes: ahora puede nacer directo de un perfil_apoyo (aliado), sin
--    pasar por una contribución existente. Se conserva contribucion_id
--    (nullable) para no romper el flujo 1:1 original.
ALTER TABLE lotes
    ALTER COLUMN contribucion_id DROP NOT NULL,
    ADD COLUMN perfil_apoyo_id uuid REFERENCES perfil_apoyo(id),
    ADD COLUMN categoria varchar,
    ADD COLUMN subcategoria_id uuid REFERENCES subcategoria_recurso(id),
    ADD COLUMN especies_aplica text[],
    ADD COLUMN cantidad_valor numeric,
    ADD COLUMN cantidad_unidad varchar,
    ADD COLUMN descripcion varchar;

ALTER TABLE lotes DROP CONSTRAINT lotes_contribucion_id_key;

ALTER TABLE lotes ADD CONSTRAINT lotes_origen_check
    CHECK (contribucion_id IS NOT NULL OR perfil_apoyo_id IS NOT NULL);

-- 2. lote_asociaciones: reparto del lote — una fila por asociación
--    invitada. Cada fila trae su propio token de QR (BACK07) con
--    vigencia limitada, para que FRONT16 confirme recepción sin
--    depender del token único del lote completo.
CREATE TABLE lote_asociaciones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lote_id uuid NOT NULL REFERENCES lotes(id),
    asociacion_id uuid NOT NULL REFERENCES asociaciones(id),
    estado varchar NOT NULL DEFAULT 'invitada',
    cantidad_asignada numeric,
    token uuid NOT NULL DEFAULT gen_random_uuid(),
    token_usado boolean NOT NULL DEFAULT false,
    token_expira_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    respondida_at timestamptz,
    confirmada_at timestamptz,
    CONSTRAINT lote_asociaciones_estado_check
        CHECK (estado IN ('invitada', 'aceptada', 'rechazada', 'confirmada')),
    CONSTRAINT lote_asociaciones_lote_id_asociacion_id_key UNIQUE (lote_id, asociacion_id)
);

-- 3. contribuciones: ya no siempre responde a una necesidad puntual — una
--    contribución puede nacer de un lote aceptado por una asociación.
ALTER TABLE contribuciones
    ALTER COLUMN necesidad_id DROP NOT NULL,
    ADD COLUMN lote_asociacion_id uuid REFERENCES lote_asociaciones(id);

-- NOT VALID: ya hay filas viejas en contribuciones con necesidad_id NULL
-- y modo='proactiva' que no vinieron de este módulo (no las creó ningún
-- endpoint del código — probablemente datos de prueba insertados a mano
-- desde el dashboard de Supabase). NOT VALID aplica el CHECK a partir de
-- ahora para inserts/updates nuevos, sin tocar ni validar esas filas
-- viejas — no se borra ni modifica nada existente.
ALTER TABLE contribuciones ADD CONSTRAINT contribuciones_origen_check
    CHECK (necesidad_id IS NOT NULL OR lote_asociacion_id IS NOT NULL) NOT VALID;

-- modo pasa a admitir 'lote' además de 'reactiva'/'proactiva' — se
-- ensancha el CHECK, no se quita ningún valor existente.
ALTER TABLE contribuciones DROP CONSTRAINT contribuciones_modo_check;
ALTER TABLE contribuciones ADD CONSTRAINT contribuciones_modo_check
    CHECK (modo IN ('reactiva', 'proactiva', 'lote'));

-- 4. FRONT14 — asociaciones cercanas y compatibles con el lote, a partir
--    de la zona_cobertura (geography) del aliado. Mismo criterio de
--    distancia/radio que encontrar_asociacion_cercana (0002_matching_functions.sql),
--    pero regresa todas las coincidencias, no solo la más cercana.
CREATE OR REPLACE FUNCTION public.asociaciones_compatibles_lote(p_perfil_apoyo_id uuid, p_especies text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, nombre character varying, latitud numeric, longitud numeric, distancia_km numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_lat double precision;
  v_lng double precision;
BEGIN
  SELECT ST_Y(zona_cobertura::geometry), ST_X(zona_cobertura::geometry)
  INTO v_lat, v_lng
  FROM perfil_apoyo WHERE perfil_apoyo.id = p_perfil_apoyo_id;

  IF v_lat IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.id, a.nombre, a.latitud, a.longitud,
    ( 6371 * acos( cos( radians(v_lat) ) * cos( radians( a.latitud ) ) * cos( radians( a.longitud ) - radians(v_lng) ) + sin( radians(v_lat) ) * sin( radians( a.latitud ) ) ) )::numeric AS distancia_km
  FROM public.asociaciones a
  WHERE
    a.activo = true
    AND a.verificado = true
    AND (p_especies IS NULL OR p_especies <@ a.tipos_animales::text[])
    AND ( 6371 * acos( cos( radians(v_lat) ) * cos( radians( a.latitud ) ) * cos( radians( a.longitud ) - radians(v_lng) ) + sin( radians(v_lat) ) * sin( radians( a.latitud ) ) ) ) <= a.radio_km
  ORDER BY distancia_km ASC;
END;
$function$;

COMMIT;
