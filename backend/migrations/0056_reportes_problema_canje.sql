-- ============================================================
-- 0056_reportes_problema_canje.sql
-- Tabla para registrar los problemas reportados por los usuarios
-- ============================================================

CREATE TABLE public.reportes_problema_canje (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    canje_id uuid NOT NULL REFERENCES public.canjes_recompensa(id) ON DELETE CASCADE,
    usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    motivo text NOT NULL,
    estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'reembolsado', 'rechazado')),
    creado_at timestamptz NOT NULL DEFAULT now(),
    actualizado_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(canje_id)
);

CREATE INDEX reportes_problema_canje_estado_idx ON public.reportes_problema_canje(estado);
CREATE INDEX reportes_problema_canje_usuario_idx ON public.reportes_problema_canje(usuario_id);

ALTER TABLE public.reportes_problema_canje ENABLE ROW LEVEL SECURITY;

-- Solo el backend accede a esta tabla por ahora
REVOKE ALL ON public.reportes_problema_canje FROM anon, authenticated;
GRANT ALL ON public.reportes_problema_canje TO service_role;
