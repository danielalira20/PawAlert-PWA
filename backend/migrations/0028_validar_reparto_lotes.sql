-- Evita que las aceptaciones de varias asociaciones superen la cantidad
-- física registrada en el lote. La validación vive también en PostgreSQL
-- para cubrir respuestas simultáneas y cualquier cliente distinto al PWA.

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_cantidad_asignada_lote()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_cantidad_total numeric;
  v_divisible varchar;
  v_cantidad_comprometida numeric;
BEGIN
  IF NEW.estado NOT IN ('aceptada', 'confirmada') THEN
    RETURN NEW;
  END IF;

  IF NEW.cantidad_asignada IS NULL OR NEW.cantidad_asignada <= 0 THEN
    RAISE EXCEPTION 'La cantidad asignada debe ser mayor a cero';
  END IF;

  -- El bloqueo serializa dos aceptaciones concurrentes del mismo lote.
  SELECT cantidad_valor, divisible
    INTO v_cantidad_total, v_divisible
  FROM public.lotes
  WHERE id = NEW.lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El lote no existe';
  END IF;

  SELECT COALESCE(SUM(cantidad_asignada), 0)
    INTO v_cantidad_comprometida
  FROM public.lote_asociaciones
  WHERE lote_id = NEW.lote_id
    AND id <> NEW.id
    AND estado IN ('aceptada', 'confirmada');

  IF v_cantidad_comprometida + NEW.cantidad_asignada > v_cantidad_total THEN
    RAISE EXCEPTION
      'La cantidad asignada supera el disponible del lote (% de %)',
      v_cantidad_comprometida + NEW.cantidad_asignada,
      v_cantidad_total;
  END IF;

  IF v_divisible = 'no' AND NEW.cantidad_asignada <> v_cantidad_total THEN
    RAISE EXCEPTION
      'Un lote no divisible debe asignarse completo (%)',
      v_cantidad_total;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS validar_cantidad_asignada_lote_trigger
  ON public.lote_asociaciones;

CREATE TRIGGER validar_cantidad_asignada_lote_trigger
BEFORE INSERT OR UPDATE OF estado, cantidad_asignada
ON public.lote_asociaciones
FOR EACH ROW
EXECUTE FUNCTION public.validar_cantidad_asignada_lote();

NOTIFY pgrst, 'reload schema';

COMMIT;
