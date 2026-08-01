-- Huellas perceptuales y moderación comunitaria independiente del rescate.

BEGIN;

ALTER TABLE public.reportes
  ADD COLUMN IF NOT EXISTS estado_moderacion text NOT NULL DEFAULT 'visible',
  ADD COLUMN IF NOT EXISTS moderacion_origen text,
  ADD COLUMN IF NOT EXISTS moderacion_actualizada_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderacion_revisada_por uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS moderacion_notas text,
  ADD COLUMN IF NOT EXISTS phash_alerta boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phash_coincidencia_reporte_id uuid REFERENCES public.reportes(id),
  ADD COLUMN IF NOT EXISTS phash_distancia integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reportes_estado_moderacion_check'
  ) THEN
    ALTER TABLE public.reportes
      ADD CONSTRAINT reportes_estado_moderacion_check
      CHECK (estado_moderacion IN ('visible', 'en_revision', 'aprobado', 'rechazado'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.reporte_imagen_hashes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid NOT NULL REFERENCES public.reportes(id) ON DELETE CASCADE,
  animal_foto_id uuid REFERENCES public.animal_fotos(id) ON DELETE CASCADE,
  phash char(16) NOT NULL,
  coincidencia_hash_id uuid REFERENCES public.reporte_imagen_hashes(id),
  distancia_hamming integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reporte_imagen_hashes_phash_formato_check
    CHECK (phash ~ '^[0-9a-f]{16}$'),
  CONSTRAINT reporte_imagen_hashes_distancia_check
    CHECK (distancia_hamming IS NULL OR distancia_hamming BETWEEN 0 AND 64)
);

CREATE INDEX IF NOT EXISTS reporte_imagen_hashes_reporte_idx
  ON public.reporte_imagen_hashes(reporte_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reporte_imagen_hashes_phash_idx
  ON public.reporte_imagen_hashes(phash);

CREATE TABLE IF NOT EXISTS public.reporte_denuncias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid NOT NULL REFERENCES public.reportes(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  motivo text NOT NULL,
  detalle text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resuelta_at timestamptz,
  resolucion text,
  CONSTRAINT reporte_denuncias_usuario_unico UNIQUE (reporte_id, usuario_id),
  CONSTRAINT reporte_denuncias_motivo_check CHECK (
    motivo IN (
      'informacion_falsa', 'foto_internet', 'reporte_repetido',
      'ubicacion_incorrecta', 'animal_no_esta', 'contenido_inapropiado',
      'posible_fraude', 'otro'
    )
  ),
  CONSTRAINT reporte_denuncias_resolucion_check CHECK (
    resolucion IS NULL OR resolucion IN ('aprobado', 'rechazado')
  )
);

CREATE INDEX IF NOT EXISTS reporte_denuncias_reporte_idx
  ON public.reporte_denuncias(reporte_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.notificaciones_moderacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  reporte_id uuid NOT NULL REFERENCES public.reportes(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('en_revision', 'aprobado', 'rechazado')),
  mensaje text NOT NULL,
  leida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notificaciones_moderacion_usuario_idx
  ON public.notificaciones_moderacion(usuario_id, leida, created_at DESC);

-- Inserta una denuncia y evalúa el umbral bajo un único bloqueo transaccional.
CREATE OR REPLACE FUNCTION public.denunciar_reporte_moderacion(
  p_reporte_id uuid,
  p_usuario_id uuid,
  p_motivo text,
  p_detalle text DEFAULT NULL,
  p_umbral integer DEFAULT 3
)
RETURNS TABLE(denuncia_id uuid, total_denuncias integer, estado_moderacion text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_denuncia_id uuid;
  v_total integer;
  v_estado text;
  v_reportante uuid;
BEGIN
  IF p_umbral < 1 THEN
    RAISE EXCEPTION 'umbral_invalido';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_reporte_id::text, 0));

  INSERT INTO public.reporte_denuncias(reporte_id, usuario_id, motivo, detalle)
  VALUES (p_reporte_id, p_usuario_id, p_motivo, NULLIF(btrim(p_detalle), ''))
  ON CONFLICT (reporte_id, usuario_id) DO NOTHING
  RETURNING id INTO v_denuncia_id;

  IF v_denuncia_id IS NULL THEN
    RAISE EXCEPTION 'denuncia_duplicada' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)::integer INTO v_total
  FROM public.reporte_denuncias
  WHERE reporte_id = p_reporte_id
    AND resuelta_at IS NULL;

  IF v_total >= p_umbral THEN
    UPDATE public.reportes AS r
    SET estado_moderacion = 'en_revision',
        moderacion_origen = 'denuncias',
        moderacion_actualizada_at = now()
    WHERE r.id = p_reporte_id
      AND r.estado_moderacion IN ('visible', 'aprobado')
    RETURNING r.usuario_id INTO v_reportante;

    IF v_reportante IS NOT NULL THEN
      INSERT INTO public.notificaciones_moderacion(usuario_id, reporte_id, tipo, mensaje)
      VALUES (
        v_reportante,
        p_reporte_id,
        'en_revision',
        'Tu reporte pasó a revisión por alertas de la comunidad. Te notificaremos cuando finalice la revisión.'
      );
    END IF;
  END IF;

  SELECT r.estado_moderacion INTO v_estado
  FROM public.reportes r WHERE r.id = p_reporte_id;

  RETURN QUERY SELECT v_denuncia_id, v_total, v_estado;
END;
$$;

ALTER TABLE public.reporte_imagen_hashes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reporte_denuncias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones_moderacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reporte_imagen_hashes, public.reporte_denuncias,
  public.notificaciones_moderacion FROM anon, authenticated;
GRANT ALL ON public.reporte_imagen_hashes, public.reporte_denuncias,
  public.notificaciones_moderacion TO service_role;
REVOKE ALL ON FUNCTION public.denunciar_reporte_moderacion(uuid, uuid, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.denunciar_reporte_moderacion(uuid, uuid, text, text, integer)
  TO service_role;

COMMENT ON COLUMN public.reportes.estado_moderacion IS
  'Controla visibilidad y revisión sin modificar el estado operativo del rescate.';
COMMENT ON TABLE public.reporte_denuncias IS
  'Una denuncia comunitaria por usuario autenticado y reporte.';

NOTIFY pgrst, 'reload schema';

COMMIT;
