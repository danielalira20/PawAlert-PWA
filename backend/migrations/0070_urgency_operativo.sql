-- Campo operativo separado del Urgency clinico.
--
-- Cuando alguien confirma que va en camino, se reduce la prioridad operativa
-- vigente sin perder el score clinico original (urgency_score/urgency_nivel
-- siguen recalculandose normalmente en segundo plano).

BEGIN;

ALTER TABLE public.reportes
  ADD COLUMN IF NOT EXISTS urgency_score_operativo numeric(5, 2),
  ADD COLUMN IF NOT EXISTS urgency_nivel_operativo text,
  ADD COLUMN IF NOT EXISTS urgency_operativo_actualizado_at timestamptz;

ALTER TABLE public.reportes
  DROP CONSTRAINT IF EXISTS reportes_urgency_score_operativo_rango_check,
  ADD CONSTRAINT reportes_urgency_score_operativo_rango_check CHECK (
    urgency_score_operativo IS NULL OR urgency_score_operativo BETWEEN 0 AND 100
  ),
  DROP CONSTRAINT IF EXISTS reportes_urgency_nivel_operativo_check,
  ADD CONSTRAINT reportes_urgency_nivel_operativo_check CHECK (
    urgency_nivel_operativo IS NULL
    OR urgency_nivel_operativo IN ('verde', 'amarillo', 'rojo')
  );

CREATE OR REPLACE FUNCTION public.excluir_urgency_en_estado_terminal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.estado_reporte::text IN (
    'rescatado', 'cerrado', 'cancelado_por_reportante', 'duplicado',
    'duplicado_vinculable', 'duplicado_informativo', 'muerto'
  ) THEN
    NEW.urgency_score := NULL;
    NEW.urgency_nivel := NULL;
    NEW.urgency_calculado_at := NULL;
    NEW.urgency_proximo_recalculo_at := NULL;
    NEW.urgency_excluido := true;
    NEW.urgency_razones_exclusion := jsonb_build_array(
      jsonb_build_object(
        'codigo', 'estado_terminal',
        'estado_reporte', NEW.estado_reporte::text
      )
    );
    NEW.urgency_score_operativo := NULL;
    NEW.urgency_nivel_operativo := NULL;
    NEW.urgency_operativo_actualizado_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON COLUMN public.reportes.urgency_score_operativo IS
  'Prioridad operativa vigente (score clinico x 0.7 al confirmar cobertura); no reemplaza urgency_score.';
COMMENT ON COLUMN public.reportes.urgency_nivel_operativo IS
  'Nivel derivado de urgency_score_operativo con las mismas cotas que urgency_nivel.';

NOTIFY pgrst, 'reload schema';

COMMIT;
