-- Entrega C (avistamientos): el CHECK de avistamientos_animal.fuente se
-- quedo sin actualizar. 0089 abrio trust_score / incidentes /
-- incidente_tipos_catalogo a los roles nuevos, y el enum LocationSource
-- (app/models/dispatch.py) ya trae 'testigo_cercano', pero la tabla
-- avistamientos_animal sigue con el CHECK original de 0071 -- que NO
-- incluye 'testigo_cercano'. Resultado: todo INSERT de un avistamiento
-- registrado como testigo_cercano revienta con
--   23514  avistamientos_animal_fuente_check
--
-- Esta migracion solo agrega ese valor al CHECK. El resto de valores es
-- identico a 0071 (no se quita ninguno). El nombre del constraint es el
-- que Postgres genero en 0071 y el que aparece en el error.

BEGIN;

ALTER TABLE public.avistamientos_animal
    DROP CONSTRAINT IF EXISTS avistamientos_animal_fuente_check;

ALTER TABLE public.avistamientos_animal
    ADD CONSTRAINT avistamientos_animal_fuente_check
    CHECK (fuente IN (
        'reporte_inicial', 'confirmacion_reportante',
        'voluntario_asignado', 'voluntario_verificado',
        'testigo_cercano',
        'asociacion', 'administracion'
    ));

NOTIFY pgrst, 'reload schema';

COMMIT;
