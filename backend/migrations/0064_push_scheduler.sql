-- 1. Dispositivos Push
-- La unicidad ahora es GLOBAL por (provider, token)
CREATE TABLE public.dispositivos_push (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'fcm' CHECK (provider = 'fcm'),
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('web', 'android', 'ios')),
  active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispositivos_push_provider_token_unico UNIQUE (provider, token)
);
CREATE INDEX dispositivos_push_usuario_activo_idx ON public.dispositivos_push(usuario_id) WHERE active = true;

-- 2. Outbox Push
CREATE TABLE public.notificaciones_push (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  reporte_id uuid REFERENCES public.reportes(id) ON DELETE CASCADE,
  propuesta_id uuid REFERENCES public.propuestas_asignacion(id) ON DELETE CASCADE,
  custodia_id uuid REFERENCES public.custodias_temporales(id) ON DELETE CASCADE,
  tipo_evento text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviada', 'fallida', 'omitida')),
  intento smallint NOT NULL DEFAULT 0,
  error_sanitizado text,
  enviada_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notificaciones_push_idempotencia_unica UNIQUE (usuario_id, idempotency_key)
);
CREATE INDEX notificaciones_push_pendientes_idx ON public.notificaciones_push(created_at) WHERE estado IN ('pendiente', 'fallida');

-- 3. Auditoría de Cron
CREATE TABLE public.urgency_scheduler_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iniciado_at timestamptz NOT NULL DEFAULT now(),
  finalizado_at timestamptz,
  duracion_ms integer,
  examined_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  degraded_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  estado text NOT NULL DEFAULT 'en_progreso' CHECK (estado IN ('en_progreso', 'completado', 'error')),
  resumen_error text
);

-- 4. Claims Atómicos
CREATE TABLE public.urgency_report_claims (
  reporte_id uuid PRIMARY KEY REFERENCES public.reportes(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.urgency_scheduler_runs(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX urgency_report_claims_expires_idx ON public.urgency_report_claims(expires_at);

-- 5. RLS y Permisos de Seguridad
ALTER TABLE public.dispositivos_push ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones_push ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urgency_scheduler_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urgency_report_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.dispositivos_push, public.notificaciones_push, public.urgency_scheduler_runs, public.urgency_report_claims FROM anon, authenticated;
GRANT ALL ON public.dispositivos_push, public.notificaciones_push, public.urgency_scheduler_runs, public.urgency_report_claims TO service_role;

-- 6. Reportes Permanencia
ALTER TABLE public.reportes
  ADD COLUMN IF NOT EXISTS confirmacion_permanencia_solicitada_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmacion_permanencia_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmacion_permanencia_respuesta text
    CHECK (confirmacion_permanencia_respuesta IS NULL OR confirmacion_permanencia_respuesta IN ('sigue_ahi', 'ya_no_esta')),
  ADD COLUMN IF NOT EXISTS confirmacion_permanencia_respondida_at timestamptz;

CREATE INDEX reportes_confirmacion_permanencia_vencida_idx
  ON public.reportes(confirmacion_permanencia_deadline_at)
  WHERE confirmacion_permanencia_deadline_at IS NOT NULL AND confirmacion_permanencia_respuesta IS NULL;

-- 7. Índice Hitos
CREATE INDEX historial_reporte_hitos_recientes_idx
  ON public.historial_reporte(reporte_id, created_at DESC)
  WHERE tipo_evento IN (
    'llegada_zona_reporte', 'animal_encontrado', 'animal_no_localizado',
    'animal_bajo_resguardo', 'llegada_veterinaria', 'llegada_hogar_temporal', 'hito_llegue_refugio'
  );

-- 8. RPC Atómica de Claims
CREATE OR REPLACE FUNCTION public.claim_due_urgency_reports(
  p_run_id uuid,
  p_limit integer DEFAULT 10
) RETURNS TABLE(reporte_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Limpiar claims vencidos
  DELETE FROM urgency_report_claims WHERE expires_at < now();

  RETURN QUERY
  WITH claimable AS (
    SELECT id
    FROM reportes
    WHERE estado_validacion_reporte = 'aprobado'
      AND urgency_excluido = false
      AND urgency_proximo_recalculo_at <= now()
      AND id NOT IN (SELECT c.reporte_id FROM urgency_report_claims c)
    ORDER BY urgency_proximo_recalculo_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  INSERT INTO urgency_report_claims (reporte_id, run_id, claimed_at, expires_at)
  SELECT id, p_run_id, now(), now() + interval '10 minutes'
  FROM claimable
  RETURNING urgency_report_claims.reporte_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_urgency_claim(
  p_reporte_id uuid, p_run_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM urgency_report_claims WHERE reporte_id = p_reporte_id AND run_id = p_run_id;
END;
$$;
