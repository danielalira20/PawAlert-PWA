-- Cada fecha límite genera su propio ciclo de avisos y una respuesta explícita.

BEGIN;

CREATE TABLE IF NOT EXISTS public.respuestas_vencimiento_custodia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custodia_id uuid NOT NULL REFERENCES public.custodias_temporales(id) ON DELETE CASCADE,
  fecha_limite_consultada timestamptz NOT NULL,
  respuesta text CHECK (respuesta IN ('puede_continuar', 'no_puede', 'no_seguro')),
  nueva_fecha_limite timestamptz,
  respondida_at timestamptz,
  creada_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (custodia_id, fecha_limite_consultada)
);

ALTER TABLE public.notificaciones_custodia
  DROP CONSTRAINT IF EXISTS notificaciones_custodia_tipo_check;
ALTER TABLE public.notificaciones_custodia
  ADD CONSTRAINT notificaciones_custodia_tipo_check CHECK (tipo IN (
    'seguimiento_proximo', 'seguimiento_vencido',
    'vencimiento_72h', 'vencimiento_48h', 'vencimiento_24h',
    'vencimiento_sin_respuesta', 'relevo_solicitado'
  ));

ALTER TABLE public.notificaciones_custodia
  ADD COLUMN IF NOT EXISTS fecha_referencia timestamptz;
UPDATE public.notificaciones_custodia
SET fecha_referencia = COALESCE(fecha_referencia, creada_at)
WHERE fecha_referencia IS NULL;
ALTER TABLE public.notificaciones_custodia
  ALTER COLUMN fecha_referencia SET NOT NULL;
ALTER TABLE public.notificaciones_custodia
  DROP CONSTRAINT IF EXISTS notificaciones_custodia_custodia_id_usuario_id_tipo_key;
CREATE UNIQUE INDEX IF NOT EXISTS notificacion_custodia_ciclo_unico
  ON public.notificaciones_custodia(custodia_id, usuario_id, tipo, fecha_referencia);

COMMIT;
