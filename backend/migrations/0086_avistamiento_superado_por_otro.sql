-- Capa 8 (avistamientos), Fase 3: estado 'superado_por_otro'.
--
-- Cuando alguien aprueba manualmente un avistamiento, los demas pendientes
-- que competian por describir la misma ubicacion dejan de estar en espera:
-- no fueron rechazados (nadie dijo que fueran falsos), simplemente otro
-- avistamiento gano. 'rechazado' mentiria sobre lo que paso, y dejarlos en
-- 'pendiente' los volveria trabajo fantasma que nadie va a resolver.
--
-- El CHECK original de 0071_avistamientos_animal_base.sql es inline y sin
-- nombre explicito, asi que Postgres lo nombro con la convencion por
-- defecto (<tabla>_<columna>_check). Se usa DROP ... IF EXISTS para que la
-- migracion sea segura aunque ese nombre no coincida en algun entorno.

BEGIN;

ALTER TABLE public.avistamientos_animal
    DROP CONSTRAINT IF EXISTS avistamientos_animal_estado_validacion_check;

ALTER TABLE public.avistamientos_animal
    ADD CONSTRAINT avistamientos_animal_estado_validacion_check
    CHECK (estado_validacion IN (
        'pendiente', 'validado', 'rechazado', 'superado_por_otro'
    ));

COMMENT ON COLUMN public.avistamientos_animal.estado_validacion IS
  'pendiente | validado | rechazado | superado_por_otro. superado_por_otro '
  'lo escribe la aprobacion manual sobre los demas pendientes del mismo '
  'caso: no es un rechazo, es "otro avistamiento gano" (Capa 8, Fase 3).';

NOTIFY pgrst, 'reload schema';

COMMIT;
