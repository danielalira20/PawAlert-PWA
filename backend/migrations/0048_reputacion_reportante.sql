-- Motor común de reputación (Persona 1 - Jass): funciones atómicas sobre
-- el esquema de 0045 (Miguel) + 0047_gamificacion_ajustes (Jass).
--
-- Sigue exactamente el patrón de 0046_recompensas_canjes_seguridad.sql
-- (Miguel): SECURITY DEFINER, SET search_path, RLS habilitado sin
-- políticas (= deny-all para anon/authenticated), REVOKE/GRANT a
-- service_role. El cliente supabase-py no expone transacciones
-- multi-statement ni locking, así que "leer saldo + insertar movimiento +
-- respetar el UNIQUE(regla, evento_origen_id)" solo puede garantizarse
-- del lado de Postgres.
--
-- Convenio de signos (documentado también en 0047 vía COMMENT):
--   otorgado/devuelto  -> puntos en positivo
--   reservado/revertido -> puntos en negativo
--   confirmado          -> informativo, no se usa todavía (Persona 5)
--


BEGIN;

ALTER TABLE public.movimientos_puntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_score ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_score_movimientos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.movimientos_puntos, public.trust_score, public.trust_score_movimientos
    FROM anon, authenticated;

-- ============================================================
-- 1. otorgar_puntos_atomico
--    Idempotente por (regla, evento_origen_id). Soporta un tope mensual
--    por OCURRENCIAS (no por suma de puntos) porque así es como está
--    definido "solo los primeros 5 reportes válidos del mes" — es un
--    conteo de eventos pagados, no un tope de puntos acumulados.
-- ============================================================
CREATE OR REPLACE FUNCTION public.otorgar_puntos_atomico(
    p_usuario_id uuid,
    p_rol text,
    p_regla text,
    p_tipo_origen text,
    p_evento_origen_id uuid,
    p_puntos integer,
    p_limite_ocurrencias_mes integer DEFAULT NULL
) RETURNS SETOF public.movimientos_puntos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ocurrencias_mes integer;
BEGIN
    -- Serializa por usuario+rol para que el conteo del tope mensual no
    -- tenga condición de carrera entre dos otorgamientos casi simultáneos.
    PERFORM pg_advisory_xact_lock(hashtext(p_usuario_id::text || ':' || p_rol)::bigint);

    IF p_limite_ocurrencias_mes IS NOT NULL THEN
        SELECT COUNT(*) INTO v_ocurrencias_mes
        FROM public.movimientos_puntos
        WHERE usuario_id = p_usuario_id
          AND rol = p_rol
          AND regla = p_regla
          AND tipo_movimiento = 'otorgado'
          AND creado_at >= date_trunc('month', now());

        IF v_ocurrencias_mes >= p_limite_ocurrencias_mes THEN
            RAISE EXCEPTION 'Limite mensual alcanzado para la regla %', p_regla
                USING ERRCODE = 'P0002';
        END IF;
    END IF;

    RETURN QUERY
    INSERT INTO public.movimientos_puntos (
        usuario_id, rol, tipo_movimiento, puntos, regla, tipo_origen, evento_origen_id
    ) VALUES (
        p_usuario_id, p_rol, 'otorgado', abs(p_puntos), p_regla, p_tipo_origen, p_evento_origen_id
    )
    ON CONFLICT (regla, evento_origen_id) DO NOTHING
    RETURNING *;
END;
$$;

-- ============================================================
-- 2. reservar_puntos_atomico
--    Calcula saldo = SUM(movimientos_puntos.puntos) del usuario+rol y
--    solo inserta la reserva (puntos en negativo) si alcanza. El
--    advisory lock evita que dos reservas concurrentes lean el mismo
--    saldo "viejo" antes de que la otra inserte su movimiento.
-- ============================================================
CREATE OR REPLACE FUNCTION public.reservar_puntos_atomico(
    p_usuario_id uuid,
    p_rol text,
    p_regla text,
    p_tipo_origen text,
    p_evento_origen_id uuid,
    p_puntos integer
) RETURNS SETOF public.movimientos_puntos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_saldo integer;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext(p_usuario_id::text || ':' || p_rol)::bigint);

    -- Idempotencia primero: si esta reserva ya se procesó, no hay que
    -- volver a validar saldo, solo devolver el movimiento existente.
    RETURN QUERY
    SELECT * FROM public.movimientos_puntos
    WHERE regla = p_regla AND evento_origen_id = p_evento_origen_id;
    IF FOUND THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(puntos), 0) INTO v_saldo
    FROM public.movimientos_puntos
    WHERE usuario_id = p_usuario_id AND rol = p_rol;

    IF v_saldo < abs(p_puntos) THEN
        RAISE EXCEPTION 'Saldo insuficiente' USING ERRCODE = 'P0001';
    END IF;

    RETURN QUERY
    INSERT INTO public.movimientos_puntos (
        usuario_id, rol, tipo_movimiento, puntos, regla, tipo_origen, evento_origen_id
    ) VALUES (
        p_usuario_id, p_rol, 'reservado', -abs(p_puntos), p_regla, p_tipo_origen, p_evento_origen_id
    )
    ON CONFLICT (regla, evento_origen_id) DO NOTHING
    RETURNING *;
END;
$$;

-- ============================================================
-- 3. devolver_puntos_atomico
--    Revierte una reserva (QR expirado/cancelado). Idempotente igual
--    que las anteriores.
-- ============================================================
CREATE OR REPLACE FUNCTION public.devolver_puntos_atomico(
    p_usuario_id uuid,
    p_rol text,
    p_regla text,
    p_tipo_origen text,
    p_evento_origen_id uuid,
    p_puntos integer
) RETURNS SETOF public.movimientos_puntos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    INSERT INTO public.movimientos_puntos (
        usuario_id, rol, tipo_movimiento, puntos, regla, tipo_origen, evento_origen_id
    ) VALUES (
        p_usuario_id, p_rol, 'devuelto', abs(p_puntos), p_regla, p_tipo_origen, p_evento_origen_id
    )
    ON CONFLICT (regla, evento_origen_id) DO NOTHING
    RETURNING *;
END;
$$;

-- ============================================================
-- 4. revertir_puntos_atomico
--    Corrección administrativa: un reporte ya pagado resulta falso
--    después. Resta puntos ya otorgados (movimiento en negativo, tipo
--    'revertido'). evento_origen_id debe ser el mismo del otorgamiento
--    original para que quede trazable qué se está corrigiendo, pero la
--    regla debe ser distinta (ej. 'reporte_valido_revertido') porque el
--    UNIQUE es (regla, evento_origen_id) y ya existe una fila con
--    ('reporte_valido', evento_origen_id).
-- ============================================================
CREATE OR REPLACE FUNCTION public.revertir_puntos_atomico(
    p_usuario_id uuid,
    p_rol text,
    p_regla text,
    p_tipo_origen text,
    p_evento_origen_id uuid,
    p_puntos integer
) RETURNS SETOF public.movimientos_puntos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    INSERT INTO public.movimientos_puntos (
        usuario_id, rol, tipo_movimiento, puntos, regla, tipo_origen, evento_origen_id
    ) VALUES (
        p_usuario_id, p_rol, 'revertido', -abs(p_puntos), p_regla, p_tipo_origen, p_evento_origen_id
    )
    ON CONFLICT (regla, evento_origen_id) DO NOTHING
    RETURNING *;
END;
$$;

-- ============================================================
-- 5. ajustar_trust_score_atomico
--    Crea la fila de trust_score si no existe (puntaje inicial 60),
--    aplica clamp [0,100], tope mensual de crecimiento (solo en
--    incremento), exige responsable_confirmacion_id cuando
--    evento_origen_id es NULL y el tipo es 'reduccion' (ajuste manual
--    sin evento de sistema detrás).
-- ============================================================
CREATE OR REPLACE FUNCTION public.ajustar_trust_score_atomico(
    p_usuario_id uuid,
    p_rol text,
    p_tipo text,
    p_valor integer,
    p_regla text,
    p_motivo text,
    p_tipo_origen text,
    p_evento_origen_id uuid,
    p_responsable_confirmacion_id uuid,
    p_limite_incremento_mes integer DEFAULT NULL
) RETURNS public.trust_score
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actual public.trust_score%ROWTYPE;
    v_incremento_mes integer;
    v_delta integer;
    v_nuevo_puntaje integer;
BEGIN
    IF p_tipo = 'reduccion' AND p_evento_origen_id IS NULL AND p_responsable_confirmacion_id IS NULL THEN
        RAISE EXCEPTION 'Una reduccion sin evento de origen requiere responsable_confirmacion_id'
            USING ERRCODE = 'P0003';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(p_usuario_id::text || ':trust:' || p_rol)::bigint);

    -- Idempotencia: si el evento ya se aplicó, no se repite. Los ajustes
    -- manuales (evento_origen_id NULL) no son deduplicables por diseño
    -- (NULL nunca choca con NULL en un UNIQUE), así que siempre se
    -- insertan tal cual las mande el llamador — la responsabilidad de no
    -- llamarlos dos veces es del admin, no de la BD.
    IF p_evento_origen_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.trust_score_movimientos
            WHERE regla = p_regla AND evento_origen_id = p_evento_origen_id
        ) THEN
            SELECT * INTO v_actual FROM public.trust_score
            WHERE usuario_id = p_usuario_id AND rol = p_rol;
            RETURN v_actual;
        END IF;
    END IF;

    SELECT * INTO v_actual FROM public.trust_score
    WHERE usuario_id = p_usuario_id AND rol = p_rol
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.trust_score (usuario_id, rol, puntaje)
        VALUES (p_usuario_id, p_rol, 60)
        RETURNING * INTO v_actual;
    END IF;

    v_delta := abs(p_valor);

    IF p_tipo = 'incremento' AND p_limite_incremento_mes IS NOT NULL THEN
        SELECT COALESCE(SUM(valor), 0) INTO v_incremento_mes
        FROM public.trust_score_movimientos
        WHERE usuario_id = p_usuario_id
          AND rol = p_rol
          AND tipo = 'incremento'
          AND creado_at >= date_trunc('month', now());

        -- Recorta al máximo disponible del mes en vez de rechazar, para
        -- no perder el reconocimiento del evento aunque ya no mueva el
        -- número.
        v_delta := GREATEST(0, LEAST(v_delta, p_limite_incremento_mes - v_incremento_mes));
    END IF;

    v_nuevo_puntaje := v_actual.puntaje + (CASE WHEN p_tipo = 'incremento' THEN v_delta ELSE -v_delta END);
    v_nuevo_puntaje := GREATEST(0, LEAST(100, v_nuevo_puntaje));

    -- Rangos según el documento de asignación: 80-100 confiable,
    -- 60-79 estandar, 40-59 en_observacion, 20-39 restringido,
    -- 0-19 suspendido. Se guarda aquí (no solo se calcula al vuelo en
    -- Python) para que quede trazable en trust_score.estado_interno cuál
    -- era el estado en cada actualización, y para que cualquier consulta
    -- directa a la tabla (ej. un reporte administrativo) no dependa de
    -- reimplementar esta lógica en otro lado.
    INSERT INTO public.trust_score_movimientos (
        usuario_id, rol, tipo, valor, regla, motivo,
        tipo_origen, evento_origen_id, responsable_confirmacion_id
    ) VALUES (
        p_usuario_id, p_rol, p_tipo, v_delta, p_regla, p_motivo,
        p_tipo_origen, p_evento_origen_id, p_responsable_confirmacion_id
    );

    UPDATE public.trust_score
    SET puntaje = v_nuevo_puntaje,
        estado_interno = CASE
            WHEN v_nuevo_puntaje >= 80 THEN 'confiable'
            WHEN v_nuevo_puntaje >= 60 THEN 'estandar'
            WHEN v_nuevo_puntaje >= 40 THEN 'en_observacion'
            WHEN v_nuevo_puntaje >= 20 THEN 'restringido'
            ELSE 'suspendido'
        END,
        actualizado_at = now()
    WHERE usuario_id = p_usuario_id AND rol = p_rol
    RETURNING * INTO v_actual;

    RETURN v_actual;
END;
$$;

REVOKE ALL ON FUNCTION public.otorgar_puntos_atomico(uuid, text, text, text, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reservar_puntos_atomico(uuid, text, text, text, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.devolver_puntos_atomico(uuid, text, text, text, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revertir_puntos_atomico(uuid, text, text, text, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ajustar_trust_score_atomico(uuid, text, text, integer, text, text, text, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.otorgar_puntos_atomico(uuid, text, text, text, uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reservar_puntos_atomico(uuid, text, text, text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.devolver_puntos_atomico(uuid, text, text, text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.revertir_puntos_atomico(uuid, text, text, text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ajustar_trust_score_atomico(uuid, text, text, integer, text, text, text, uuid, uuid, integer) TO service_role;

COMMIT;