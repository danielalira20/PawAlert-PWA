-- Persona 4: canjes reales, inventario atómico y defensa en profundidad.
BEGIN;

CREATE TABLE public.canjes_recompensa (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recompensa_id uuid NOT NULL REFERENCES public.recompensas(id),
    beneficiario_id uuid NOT NULL REFERENCES public.usuarios(id),
    codigo text NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
    estado text NOT NULL DEFAULT 'emitido' CHECK (estado IN ('emitido', 'confirmado', 'cancelado')),
    condiciones_snapshot text,
    forma_entrega_snapshot text NOT NULL,
    costo_snapshot integer NOT NULL CHECK (costo_snapshot > 0),
    emitido_at timestamptz NOT NULL DEFAULT now(),
    confirmado_at timestamptz,
    UNIQUE (recompensa_id, beneficiario_id)
);
CREATE INDEX canjes_recompensa_recompensa_estado_idx
    ON public.canjes_recompensa(recompensa_id, estado);

ALTER TABLE public.recompensas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insignias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canjes_recompensa ENABLE ROW LEVEL SECURITY;

-- Estas tablas se consumen exclusivamente a través del backend. El rol de
-- servicio ignora RLS; anon/authenticated no reciben políticas directas.
REVOKE ALL ON public.recompensas, public.insignias, public.canjes_recompensa FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.emitir_canje_recompensa(
    p_recompensa_id uuid,
    p_beneficiario_id uuid
) RETURNS SETOF public.canjes_recompensa
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    r public.recompensas%ROWTYPE;
BEGIN
    SELECT * INTO r FROM public.recompensas
    WHERE id = p_recompensa_id FOR UPDATE;

    IF NOT FOUND OR r.estado <> 'activa' OR r.unidades_disponibles <= 0
       OR CURRENT_DATE < r.inicio OR CURRENT_DATE > r.vencimiento THEN
        RAISE EXCEPTION 'Recompensa no disponible' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.recompensas SET
        unidades_disponibles = unidades_disponibles - 1,
        estado = CASE WHEN unidades_disponibles - 1 = 0 THEN 'agotada' ELSE estado END,
        actualizado_at = now()
    WHERE id = r.id;

    RETURN QUERY INSERT INTO public.canjes_recompensa (
        recompensa_id, beneficiario_id, condiciones_snapshot,
        forma_entrega_snapshot, costo_snapshot
    ) VALUES (
        r.id, p_beneficiario_id, r.condiciones, r.forma_entrega, r.costo
    ) RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirmar_canje_recompensa(
    p_codigo text,
    p_propietario_id uuid
) RETURNS SETOF public.canjes_recompensa
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    UPDATE public.canjes_recompensa c SET
        estado = 'confirmado', confirmado_at = now()
    FROM public.recompensas r
    WHERE c.recompensa_id = r.id
      AND r.propietario_id = p_propietario_id
      AND c.codigo = upper(trim(p_codigo))
      AND c.estado = 'emitido'
    RETURNING c.*;
END;
$$;

REVOKE ALL ON FUNCTION public.emitir_canje_recompensa(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirmar_canje_recompensa(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emitir_canje_recompensa(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirmar_canje_recompensa(text, uuid) TO service_role;

COMMIT;
