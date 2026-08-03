-- Las asociaciones regionales formulan dudas a la coordinadora; únicamente
-- la coordinadora solicita aclaraciones al hogar temporal.

BEGIN;

CREATE TABLE IF NOT EXISTS public.aclaraciones_seguimiento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seguimiento_id uuid NOT NULL REFERENCES public.seguimientos_resguardo(id) ON DELETE CASCADE,
  custodia_id uuid NOT NULL REFERENCES public.custodias_temporales(id) ON DELETE CASCADE,
  asociacion_origen_id uuid NOT NULL REFERENCES public.asociaciones(id) ON DELETE RESTRICT,
  creada_por_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  pregunta_regional text NOT NULL,
  mensaje_coordinadora text,
  respuesta_voluntario text,
  foto_respuesta_url text,
  estado text NOT NULL CHECK (estado IN (
    'pendiente_coordinadora', 'enviada_voluntario', 'respondida',
    'resuelta', 'descartada'
  )),
  creada_at timestamptz NOT NULL DEFAULT now(),
  enviada_at timestamptz,
  respondida_at timestamptz,
  resuelta_at timestamptz,
  resuelta_por_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS aclaraciones_custodia_estado_idx
  ON public.aclaraciones_seguimiento(custodia_id, estado, creada_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS aclaracion_activa_por_origen
  ON public.aclaraciones_seguimiento(seguimiento_id, asociacion_origen_id)
  WHERE estado IN ('pendiente_coordinadora', 'enviada_voluntario', 'respondida');

COMMIT;
