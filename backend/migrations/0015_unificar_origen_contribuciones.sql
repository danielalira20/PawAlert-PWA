-- Al mergear miguel-dev con DJ quedaron DOS CHECK distintos en
-- contribuciones exigiendo cada uno su propio "origen":
--   - contribuciones_origen_check (0011_lotes_multi_asociacion.sql):
--     necesidad_id OR lote_asociacion_id
--   - contribuciones_necesidad_o_reporte_check (0012_aceptar_sugerencia_aliado.sql):
--     necesidad_id OR reporte_id
-- Como Postgres exige TODOS los CHECK a la vez, una contribución nacida
-- de un lote (solo lote_asociacion_id) fallaba el segundo, y una nacida
-- de un reporte (solo reporte_id) fallaría el primero. Se unifican en uno
-- solo que acepta cualquiera de los tres orígenes — no se quita ningún
-- caso que ya funcionaba, solo se ensancha.

BEGIN;

ALTER TABLE contribuciones DROP CONSTRAINT IF EXISTS contribuciones_origen_check;
ALTER TABLE contribuciones DROP CONSTRAINT IF EXISTS contribuciones_necesidad_o_reporte_check;

ALTER TABLE contribuciones ADD CONSTRAINT contribuciones_origen_check
    CHECK (necesidad_id IS NOT NULL OR reporte_id IS NOT NULL OR lote_asociacion_id IS NOT NULL)
    NOT VALID;

COMMIT;
