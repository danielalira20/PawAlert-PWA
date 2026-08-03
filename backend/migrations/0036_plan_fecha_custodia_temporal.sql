-- Separa la preferencia general del perfil de la fecha concreta acordada
-- para cada animal y estructura la ruta hacia el hogar temporal.

BEGIN;

CREATE TABLE IF NOT EXISTS public.planes_custodia_temporal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid NOT NULL UNIQUE REFERENCES public.reportes(id) ON DELETE CASCADE,
  voluntario_id uuid NOT NULL REFERENCES public.voluntarios(id) ON DELETE RESTRICT,
  ruta_resguardo text NOT NULL
    CHECK (ruta_resguardo IN ('directo_hogar', 'veterinaria_y_hogar')),
  fecha_limite_propuesta timestamptz NOT NULL,
  fecha_limite_confirmada timestamptz,
  creada_at timestamptz NOT NULL DEFAULT now(),
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  confirmada_at timestamptz
);

CREATE INDEX IF NOT EXISTS planes_custodia_voluntario_idx
  ON public.planes_custodia_temporal(voluntario_id, actualizado_at DESC);

ALTER TABLE public.custodias_temporales
  ADD COLUMN IF NOT EXISTS ruta_ingreso text
    CHECK (ruta_ingreso IN ('directo_hogar', 'veterinaria_y_hogar')),
  ADD COLUMN IF NOT EXISTS fecha_limite_confirmada_at timestamptz;

COMMENT ON COLUMN public.planes_custodia_temporal.fecha_limite_propuesta IS
  'Fecha concreta propuesta para este animal; no deriva de la preferencia general del perfil.';
COMMENT ON COLUMN public.custodias_temporales.ruta_ingreso IS
  'Indica si el externo llegó directo o después de una atención veterinaria.';

COMMIT;
