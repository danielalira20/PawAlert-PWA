-- Vencimiento seguro de revisiones cuya unica causa bloqueante es CLIP gris.

BEGIN;

ALTER TABLE public.reportes
  ADD COLUMN IF NOT EXISTS validacion_revision_expira_at timestamptz;

CREATE INDEX IF NOT EXISTS reportes_revision_clip_vencida_idx
  ON public.reportes(validacion_revision_expira_at, created_at)
  WHERE estado_validacion_reporte = 'revision_manual'
    AND validacion_revision_expira_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.clip_gray_validation_claims (
  reporte_id uuid PRIMARY KEY
    REFERENCES public.reportes(id) ON DELETE CASCADE,
  claim_token uuid NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS clip_gray_validation_claims_expires_idx
  ON public.clip_gray_validation_claims(expires_at);

ALTER TABLE public.clip_gray_validation_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clip_gray_validation_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.clip_gray_validation_claims TO service_role;

CREATE OR REPLACE FUNCTION public.claim_due_clip_gray_reports(
  p_claim_token uuid,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(reporte_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'p_limit debe estar entre 1 y 100';
  END IF;

  DELETE FROM clip_gray_validation_claims WHERE expires_at < now();

  RETURN QUERY
  WITH claimable AS (
    SELECT r.id
    FROM reportes r
    WHERE r.estado_validacion_reporte = 'revision_manual'
      AND r.validacion_revision_expira_at <= now()
      AND r.estado_cobertura IS NULL
      AND r.asociacion_asignada_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(r.razones_validacion) razon
        WHERE razon->>'codigo' = 'clip_zona_gris'
          AND razon->>'resultado' = 'revision_temporal'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(r.razones_validacion) razon
        WHERE razon->>'codigo' <> 'clip_zona_gris'
          AND COALESCE(razon->>'resultado', 'revision_manual') <> 'sin_bloqueo'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM clip_gray_validation_claims claim
        WHERE claim.reporte_id = r.id
      )
    ORDER BY r.validacion_revision_expira_at, r.created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  INSERT INTO clip_gray_validation_claims (
    reporte_id, claim_token, claimed_at, expires_at
  )
  SELECT id, p_claim_token, now(), now() + interval '5 minutes'
  FROM claimable
  RETURNING clip_gray_validation_claims.reporte_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_clip_gray_claim(
  p_reporte_id uuid,
  p_claim_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  DELETE FROM clip_gray_validation_claims
  WHERE reporte_id = p_reporte_id
    AND claim_token = p_claim_token;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_due_clip_gray_reports(uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_clip_gray_claim(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_clip_gray_reports(uuid, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_clip_gray_claim(uuid, uuid)
  TO service_role;

COMMENT ON COLUMN public.reportes.validacion_revision_expira_at IS
  'Vencimiento de una revision temporal; solo CLIP gris puede autoaprobarse.';
COMMENT ON TABLE public.clip_gray_validation_claims IS
  'Claims breves para procesar una sola vez las revisiones CLIP grises vencidas.';

NOTIFY pgrst, 'reload schema';

COMMIT;
