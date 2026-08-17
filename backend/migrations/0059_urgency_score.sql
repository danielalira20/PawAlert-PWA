-- Persistencia explicable del Urgency Score v1.
--
-- La tabla reportes conserva solamente el resultado operativo vigente. Cada
-- calculo completo se guarda en reporte_urgency_evaluaciones para poder
-- reconstruir por que un caso cambio de prioridad.

BEGIN;

ALTER TABLE public.reportes
  ADD COLUMN IF NOT EXISTS urgency_score numeric(5, 2),
  ADD COLUMN IF NOT EXISTS urgency_nivel text,
  ADD COLUMN IF NOT EXISTS urgency_calculado_at timestamptz,
  ADD COLUMN IF NOT EXISTS urgency_proximo_recalculo_at timestamptz,
  ADD COLUMN IF NOT EXISTS urgency_formula_version text,
  ADD COLUMN IF NOT EXISTS urgency_excluido boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS urgency_razones_exclusion jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.reportes
  DROP CONSTRAINT IF EXISTS reportes_urgency_score_rango_check,
  ADD CONSTRAINT reportes_urgency_score_rango_check CHECK (
    urgency_score IS NULL OR urgency_score BETWEEN 0 AND 100
  ),
  DROP CONSTRAINT IF EXISTS reportes_urgency_nivel_check,
  ADD CONSTRAINT reportes_urgency_nivel_check CHECK (
    urgency_nivel IS NULL OR urgency_nivel IN ('verde', 'amarillo', 'rojo')
  ),
  DROP CONSTRAINT IF EXISTS reportes_urgency_razones_array_check,
  ADD CONSTRAINT reportes_urgency_razones_array_check CHECK (
    jsonb_typeof(urgency_razones_exclusion) = 'array'
  ),
  DROP CONSTRAINT IF EXISTS reportes_urgency_resultado_coherente_check,
  ADD CONSTRAINT reportes_urgency_resultado_coherente_check CHECK (
    (
      urgency_excluido
      AND urgency_score IS NULL
      AND urgency_nivel IS NULL
      AND jsonb_array_length(urgency_razones_exclusion) > 0
    )
    OR (
      NOT urgency_excluido
      AND (
        (urgency_score IS NULL AND urgency_nivel IS NULL)
        OR (urgency_score < 40 AND urgency_nivel = 'verde')
        OR (urgency_score >= 40 AND urgency_score < 70 AND urgency_nivel = 'amarillo')
        OR (urgency_score >= 70 AND urgency_nivel = 'rojo')
      )
    )
  );

CREATE TABLE IF NOT EXISTS public.reporte_urgency_evaluaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid NOT NULL REFERENCES public.reportes(id) ON DELETE CASCADE,
  formula_version text NOT NULL DEFAULT 'urgency_v1',
  score numeric(5, 2),
  nivel text,
  condicion_ia_score smallint,
  condicion_declarada_score smallint,
  tiempo_score numeric(5, 2),
  clima_score smallint,
  clima_status text,
  clima_detalle jsonb,
  riesgo_vial_score smallint,
  riesgo_vial_status text,
  riesgo_vial_detalle jsonb,
  componentes_aplicados jsonb NOT NULL DEFAULT '{}'::jsonb,
  excluido boolean NOT NULL DEFAULT false,
  razones_exclusion jsonb NOT NULL DEFAULT '[]'::jsonb,
  calculado_at timestamptz NOT NULL DEFAULT now(),
  proximo_recalculo_at timestamptz,
  CONSTRAINT reporte_urgency_score_rango_check CHECK (
    score IS NULL OR score BETWEEN 0 AND 100
  ),
  CONSTRAINT reporte_urgency_nivel_check CHECK (
    nivel IS NULL OR nivel IN ('verde', 'amarillo', 'rojo')
  ),
  CONSTRAINT reporte_urgency_condicion_ia_check CHECK (
    condicion_ia_score IS NULL OR condicion_ia_score IN (20, 70, 100)
  ),
  CONSTRAINT reporte_urgency_condicion_declarada_check CHECK (
    condicion_declarada_score IS NULL OR condicion_declarada_score IN (20, 60, 100)
  ),
  CONSTRAINT reporte_urgency_tiempo_check CHECK (
    tiempo_score IS NULL OR tiempo_score BETWEEN 0 AND 100
  ),
  CONSTRAINT reporte_urgency_clima_check CHECK (
    clima_score IS NULL OR clima_score IN (0, 50, 100)
  ),
  CONSTRAINT reporte_urgency_riesgo_vial_check CHECK (
    riesgo_vial_score IS NULL OR riesgo_vial_score IN (0, 100)
  ),
  CONSTRAINT reporte_urgency_clima_status_check CHECK (
    clima_status IS NULL OR clima_status IN (
      'complete', 'cached', 'stale_cache', 'unavailable'
    )
  ),
  CONSTRAINT reporte_urgency_riesgo_vial_status_check CHECK (
    riesgo_vial_status IS NULL OR riesgo_vial_status IN (
      'complete', 'cached', 'stale_cache', 'unavailable'
    )
  ),
  CONSTRAINT reporte_urgency_clima_coherente_check CHECK (
    (clima_status IS NULL AND clima_score IS NULL)
    OR (clima_status = 'unavailable' AND clima_score IS NULL)
    OR (
      clima_status IN ('complete', 'cached', 'stale_cache')
      AND clima_score IS NOT NULL
    )
  ),
  CONSTRAINT reporte_urgency_riesgo_vial_coherente_check CHECK (
    (riesgo_vial_status IS NULL AND riesgo_vial_score IS NULL)
    OR (riesgo_vial_status = 'unavailable' AND riesgo_vial_score IS NULL)
    OR (
      riesgo_vial_status IN ('complete', 'cached', 'stale_cache')
      AND riesgo_vial_score IS NOT NULL
    )
  ),
  CONSTRAINT reporte_urgency_json_check CHECK (
    jsonb_typeof(componentes_aplicados) = 'object'
    AND jsonb_typeof(razones_exclusion) = 'array'
  ),
  CONSTRAINT reporte_urgency_resultado_coherente_check CHECK (
    (
      excluido
      AND score IS NULL
      AND nivel IS NULL
      AND jsonb_array_length(razones_exclusion) > 0
    )
    OR (
      NOT excluido
      AND score IS NOT NULL
      AND (
        (score < 40 AND nivel = 'verde')
        OR (score >= 40 AND score < 70 AND nivel = 'amarillo')
        OR (score >= 70 AND nivel = 'rojo')
      )
    )
  )
);

CREATE INDEX IF NOT EXISTS reporte_urgency_reporte_fecha_idx
  ON public.reporte_urgency_evaluaciones(reporte_id, calculado_at DESC);

CREATE INDEX IF NOT EXISTS reportes_urgency_recalculo_pendiente_idx
  ON public.reportes(urgency_proximo_recalculo_at)
  WHERE urgency_excluido = false
    AND urgency_proximo_recalculo_at IS NOT NULL
    AND estado_validacion_reporte = 'aprobado';

ALTER TABLE public.reporte_urgency_evaluaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reporte_urgency_evaluaciones
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.reporte_urgency_evaluaciones TO service_role;

COMMENT ON COLUMN public.reportes.urgency_score IS
  'Score operativo vigente de 0 a 100; NULL si aun no se calcula o esta excluido.';
COMMENT ON COLUMN public.reportes.urgency_nivel IS
  'Nivel derivado del score: verde <40, amarillo 40-69.99, rojo >=70.';
COMMENT ON COLUMN public.reportes.urgency_excluido IS
  'Impide calcular y publicar urgencia mientras exista una restriccion operativa.';
COMMENT ON TABLE public.reporte_urgency_evaluaciones IS
  'Historial inmutable de entradas, proveedores y resultado de cada calculo de urgencia.';

NOTIFY pgrst, 'reload schema';

COMMIT;
