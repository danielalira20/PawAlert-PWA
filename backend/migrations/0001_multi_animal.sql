BEGIN;

-- Habilita multi-animal (Miguel confirma: 100% seguro, cada reporte
-- existente ya tiene exactamente 1 animal — no hay riesgo de pérdida)
ALTER TABLE animal DROP CONSTRAINT animal_reporte_id_key;
ALTER TABLE animal ADD COLUMN orden integer NOT NULL DEFAULT 1;

-- Modo grupo (Magui)
ALTER TABLE animal ADD COLUMN es_grupo boolean NOT NULL DEFAULT false;
ALTER TABLE animal ADD COLUMN cantidad integer NOT NULL DEFAULT 1;
ALTER TABLE animal ADD CONSTRAINT animal_cantidad_check CHECK (cantidad >= 1);
ALTER TABLE animal ADD CONSTRAINT animal_grupo_cantidad_check CHECK (es_grupo = false OR cantidad > 1);

-- Camada de la madre (Jass)
ALTER TABLE animal ADD COLUMN trae_crias_nacidas boolean;
ALTER TABLE animal ADD COLUMN numero_crias_nacidas integer;

COMMIT;
