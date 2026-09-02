-- Capa 8 (avistamientos), Fase 6.5: FK real de la foto de evidencia.
--
-- 0071_avistamientos_animal_base.sql dejo avistamientos_animal.evidencia_id
-- como uuid suelto ("sin FK todavia -- se vincula en Entrega B"). Ahora que
-- el flujo de foto de avistamientos reusa reporte_evidencias (igual que los
-- hitos), se cierra esa referencia.
--
-- FK COMPUESTA (evidencia_id, reporte_id) -> reporte_evidencias(id, reporte_id):
-- aprovecha el indice unico reporte_evidencias_id_reporte_id_unico creado en
-- 0077 y garantiza a nivel de base que la foto pertenece al MISMO reporte que
-- el avistamiento (no solo que la evidencia existe). Mismo patron que
-- resultados_rescate_sin_vida en 0077.
--
-- ON DELETE SET NULL (no CASCADE): purgar una evidencia no debe borrar el
-- avistamiento, que sigue siendo una ubicacion confirmada valida sin la foto.
--
-- Sin riesgo de regresion: hasta esta fase nada escribia evidencia_id, asi
-- que todas las filas existentes de avistamientos_animal lo tienen en NULL y
-- una FK NULLable no las invalida.

BEGIN;

ALTER TABLE public.avistamientos_animal
    ADD CONSTRAINT avistamientos_animal_evidencia_fk
    FOREIGN KEY (evidencia_id, reporte_id)
    REFERENCES public.reporte_evidencias(id, reporte_id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.avistamientos_animal.evidencia_id IS
  'Foto de evidencia del avistamiento (reporte_evidencias). FK compuesta con '
  'reporte_id: la evidencia siempre pertenece al mismo reporte. NULL cuando '
  'el avistamiento se registro sin foto (Capa 8, Fase 6.5).';

NOTIFY pgrst, 'reload schema';

COMMIT;
