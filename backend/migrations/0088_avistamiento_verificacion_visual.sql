-- Capa 8 (avistamientos): verificacion visual contra la(s) foto(s)
-- originales del animal reportado, via Gemini multimodal.
--
-- No bloquea el registro por si sola: bloquear por "no es animal" o
-- "especie no coincide" ya ocurre antes del INSERT (en la API), asi que esas
-- filas nunca llegan a existir. Estas columnas solo guardan el resultado
-- para los casos que SI se registraron -- en particular la advertencia no
-- bloqueante cuando la probabilidad de que sea el mismo animal sale baja,
-- para que la asociacion la vea al revisar el avistamiento.
--
-- Mismo naming que animal_fotos.analisis_ia_* (report_service.py /
-- report_photo_vision_service.py) por consistencia.

BEGIN;

ALTER TABLE public.avistamientos_animal
    ADD COLUMN analisis_ia_estado varchar
        CHECK (analisis_ia_estado IS NULL OR analisis_ia_estado IN (
            'completado', 'error_tecnico', 'sin_referencia', 'no_configurado'
        )),
    ADD COLUMN analisis_ia_probabilidad_mismo_animal numeric
        CHECK (
            analisis_ia_probabilidad_mismo_animal IS NULL
            OR (analisis_ia_probabilidad_mismo_animal >= 0 AND analisis_ia_probabilidad_mismo_animal <= 1)
        ),
    ADD COLUMN analisis_ia_modelo varchar,
    ADD COLUMN advertencia_visual text;

COMMENT ON COLUMN public.avistamientos_animal.analisis_ia_estado IS
  'Resultado tecnico de comparar la foto del avistamiento contra las fotos originales del animal (Gemini). NULL si el avistamiento no traia foto.';
COMMENT ON COLUMN public.avistamientos_animal.analisis_ia_probabilidad_mismo_animal IS
  'Probabilidad (0-1) estimada por Gemini de que la foto del avistamiento muestre al mismo animal del reporte. Solo informativo -- no bloquea nada por si sola.';
COMMENT ON COLUMN public.avistamientos_animal.advertencia_visual IS
  'Mensaje NO bloqueante para quien revise el caso, cuando la probabilidad de que sea el mismo animal cae por debajo de AVISTAMIENTO_UMBRAL_PROBABILIDAD_MISMO_ANIMAL. NULL si no hubo advertencia.';

NOTIFY pgrst, 'reload schema';

COMMIT;
