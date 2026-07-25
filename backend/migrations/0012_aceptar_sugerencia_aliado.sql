-- BACK02 — aceptar la sugerencia del motor de Ruta 1 (0011_sugerencia_veterinaria.sql)
-- y reservar capacidad de forma atómica.
--
-- Dos cambios independientes en este archivo:
--
-- 1. reservar_capacidad_oferta(): función GENÉRICA, sin nada específico de
--    Ruta 1 en el nombre ni en la lógica — cualquier flujo que necesite
--    descontar capacidad de una oferta_proactiva la puede llamar igual
--    (incluyendo BACK06 de Diego más adelante, cuando exista el flujo de
--    aceptar una contribución reactiva normal que también venga de una
--    oferta_proactiva_id).
--
-- 2. Ajuste de esquema en contribuciones: necesidad_id pasa a nullable y se
--    agrega reporte_id, porque el flujo de Ruta 1 nunca crea una necesidad
--    — el match nace directo del hito, no de una necesidad publicada.

CREATE OR REPLACE FUNCTION public.reservar_capacidad_oferta(
  p_oferta_id uuid,
  p_cantidad numeric
)
RETURNS numeric
LANGUAGE plpgsql
AS $function$
DECLARE
  v_capacidad_resultante numeric;
BEGIN
  -- El WHERE capacidad_disponible >= p_cantidad se evalúa atómicamente
  -- contra el valor de fila más reciente dentro de esta misma sentencia:
  -- dos llamadas concurrentes nunca pueden restar por debajo de cero,
  -- porque solo una de las dos encuentra la fila que cumple la condición.
  UPDATE public.ofertas_proactivas
  SET capacidad_disponible = capacidad_disponible - p_cantidad,
      -- Se apaga sola cuando se agota (formularios-red-aliados-pawalert.md:
      -- "activa — se apaga cuando se agota la capacidad o el aliado la pausa").
      -- Mismo UPDATE atómico, no una operación aparte que pueda desincronizarse.
      activa = CASE WHEN capacidad_disponible - p_cantidad <= 0 THEN false ELSE activa END
  WHERE id = p_oferta_id
    AND activa = true
    AND capacidad_disponible >= p_cantidad
  RETURNING capacidad_disponible INTO v_capacidad_resultante;

  RETURN v_capacidad_resultante;  -- NULL si no alcanzaba, no existe, o ya no está activa
END;
$function$;

ALTER TABLE public.contribuciones ALTER COLUMN necesidad_id DROP NOT NULL;

ALTER TABLE public.contribuciones ADD COLUMN reporte_id uuid;

ALTER TABLE public.contribuciones ADD CONSTRAINT contribuciones_reporte_id_fkey
  FOREIGN KEY (reporte_id) REFERENCES public.reportes(id);

ALTER TABLE public.contribuciones ADD CONSTRAINT contribuciones_necesidad_o_reporte_check
  CHECK (necesidad_id IS NOT NULL OR reporte_id IS NOT NULL);
