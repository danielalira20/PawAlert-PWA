-- 0077_pool_interesados_reporte.sql
--
-- Capa 6 (Magui) — Pool de interesados por reporte
--
-- Guarda el ranking completo de candidatos calculado por matching/VROOM
-- al momento de escalar un reporte. posicion=1 es el voluntario al que se
-- le envio la propuesta; posicion>1 son los candidatos en lista de espera,
-- ordenados de mejor a peor. Cuando el ganador no responde (propuesta vence),
-- coverage_service promueve al siguiente en orden.
--
-- Restricciones de diseno:
--   - Un voluntario solo aparece una vez por reporte (UNIQUE en reporte+voluntario).
--   - La tabla usa DELETE CASCADE desde reportes: si se borra un reporte, se limpia el pool.
--   - RLS activo; solo service_role puede leer/escribir (nunca anon/authenticated).

BEGIN;

CREATE TABLE IF NOT EXISTS public.pool_interesados_reporte (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    reporte_id    UUID        NOT NULL REFERENCES public.reportes(id) ON DELETE CASCADE,
    voluntario_id UUID        NOT NULL REFERENCES public.voluntarios(id) ON DELETE RESTRICT,
    usuario_id    UUID        NOT NULL REFERENCES public.usuarios(id)   ON DELETE RESTRICT,
    -- 1 = ganador (propuesta enviada), 2, 3 ... = lista de espera
    posicion      INTEGER     NOT NULL CHECK (posicion >= 1),
    estado        TEXT        NOT NULL DEFAULT 'en_espera'
        CHECK (estado IN (
            'propuesta_enviada',
            'en_espera',
            'descartado',
            'aceptado',
            'vencido'
        )),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pool_interesados_unico UNIQUE (reporte_id, voluntario_id)
);

-- Indice para recuperar rapidamente el siguiente en espera
CREATE INDEX IF NOT EXISTS pool_interesados_reporte_pos_idx
    ON public.pool_interesados_reporte(reporte_id, posicion)
    WHERE estado IN ('en_espera', 'propuesta_enviada');

-- RLS: tabla interna, nunca expuesta a anon/authenticated
ALTER TABLE public.pool_interesados_reporte ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pool_interesados_reporte FROM anon, authenticated;
GRANT ALL  ON public.pool_interesados_reporte TO service_role;

COMMIT;
