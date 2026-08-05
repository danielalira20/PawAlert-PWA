BEGIN;

-- La adopción queda fuera del alcance del flujo actual. Se conserva la tabla
-- de procesos para validar ingresos formales y no se eliminan registros
-- históricos que pudieran haberse creado antes de esta migración.
ALTER TABLE public.procesos_resolucion_custodia
  DROP CONSTRAINT IF EXISTS procesos_resolucion_custodia_tipo_check,
  DROP CONSTRAINT IF EXISTS procesos_resolucion_custodia_check,
  DROP CONSTRAINT IF EXISTS procesos_resolucion_custodia_tipo_actual_check;

ALTER TABLE public.procesos_resolucion_custodia
  ADD CONSTRAINT procesos_resolucion_custodia_tipo_actual_check
  CHECK (tipo = 'ingreso_formal_asociacion') NOT VALID;

COMMIT;
