-- Trazabilidad y revisión remota estructurada para verificaciones de hogar.
--
-- Conserva cada ronda de evidencia y cada cambio importante del flujo. La
-- información actual de verificaciones_hogar sigue disponible para no romper
-- las pantallas existentes.

BEGIN;

ALTER TABLE public.verificaciones_hogar
  ADD COLUMN IF NOT EXISTS checklist_remoto jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS checklist_remoto_completado_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS modalidad_definida_por uuid
    REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS modalidad_definida_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS resuelta_por_usuario_id uuid
    REFERENCES public.usuarios(id);

CREATE TABLE IF NOT EXISTS public.rondas_evidencia_verificacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verificacion_hogar_id uuid NOT NULL
    REFERENCES public.verificaciones_hogar(id),
  numero integer NOT NULL CHECK (numero >= 1),
  estado character varying NOT NULL DEFAULT 'solicitada'
    CHECK (estado IN ('inicial', 'solicitada', 'entregada', 'cancelada')),
  tipos_solicitados text[] NOT NULL DEFAULT '{}'::text[],
  instrucciones text,
  solicitada_por_usuario_id uuid REFERENCES public.usuarios(id),
  evidencia_anterior jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidencia_entregada jsonb NOT NULL DEFAULT '{}'::jsonb,
  solicitada_at timestamp with time zone,
  entregada_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (verificacion_hogar_id, numero)
);

CREATE INDEX IF NOT EXISTS rondas_evidencia_verificacion_idx
  ON public.rondas_evidencia_verificacion(verificacion_hogar_id, numero DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ronda_evidencia_pendiente_idx
  ON public.rondas_evidencia_verificacion(verificacion_hogar_id)
  WHERE estado = 'solicitada';

CREATE TABLE IF NOT EXISTS public.bitacora_verificacion_hogar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verificacion_hogar_id uuid NOT NULL
    REFERENCES public.verificaciones_hogar(id),
  tipo_evento character varying NOT NULL,
  actor_usuario_id uuid REFERENCES public.usuarios(id),
  actor_tipo character varying NOT NULL DEFAULT 'sistema'
    CHECK (actor_tipo IN ('sistema', 'asociacion', 'postulante', 'verificador')),
  descripcion text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bitacora_verificacion_hogar_idx
  ON public.bitacora_verificacion_hogar(verificacion_hogar_id, created_at DESC);

-- Crea una ronda inicial para expedientes existentes sin alterar sus estados.
INSERT INTO public.rondas_evidencia_verificacion (
  verificacion_hogar_id,
  numero,
  estado,
  evidencia_anterior,
  entregada_at
)
SELECT
  vh.id,
  1,
  'inicial',
  jsonb_build_object(
    'identificacion_url', pct.identificacion_url,
    'video_url', pct.video_recorrido_url,
    'analisis_video', vh.analisis_video,
    'analisis_video_estado', vh.analisis_video_estado,
    'analisis_video_modelo', vh.analisis_video_modelo,
    'analisis_video_error', vh.analisis_video_error,
    'estado_coordenadas', vh.estado_coordenadas,
    'distancia_coordenadas_m', vh.distancia_coordenadas_m
  ),
  vh.created_at
FROM public.verificaciones_hogar vh
JOIN public.perfil_casa_temporal pct
  ON pct.id = vh.perfil_casa_temporal_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.rondas_evidencia_verificacion rev
  WHERE rev.verificacion_hogar_id = vh.id
);

COMMIT;
