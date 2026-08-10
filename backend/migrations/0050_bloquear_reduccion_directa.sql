-- Cierra la puerta directa de ajustar_trust_score_atomico para
-- reducciones. Hasta ahora, cualquier llamador podia restar trust score
-- con solo pasar tipo='reduccion' + responsable_confirmacion_id -- eso
-- sigue siendo tecnicamente posible en el codigo aunque el sistema de
-- Incidentes (0049) ya exista, porque nada impedia el camino viejo.
--
-- A partir de esta migracion, ajustar_trust_score_atomico RECHAZA
-- cualquier llamada con tipo='reduccion' cuyo tipo_origen no sea
-- exactamente 'incidente'. La unica via legitima para reducir trust
-- score pasa a ser: registrar_incidente -> confirmar_incidente, que ya
-- llama a esta misma funcion con tipo_origen='incidente' internamente
-- (ver confirmar_incidente_atomico en 0049).
--
-- Los incrementos NO se tocan -- siguen siendo automaticos, disparados
-- directo por reputacion_service.ajustar_trust_score(tipo='incremento').
--
-- Pendiente de ejecutar manualmente en Supabase.

BEGIN;

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
    -- Bloqueo nuevo: toda reduccion debe venir del sistema de Incidentes.
    IF p_tipo = 'reduccion' AND COALESCE(p_tipo_origen, '') <> 'incidente' THEN
        RAISE EXCEPTION 'Las reducciones de trust score solo pueden aplicarse a traves del sistema de Incidentes (registrar_incidente -> confirmar_incidente). tipo_origen recibido: %', p_tipo_origen
            USING ERRCODE = 'P0006';
    END IF;

    IF p_tipo = 'reduccion' AND p_evento_origen_id IS NULL AND p_responsable_confirmacion_id IS NULL THEN
        RAISE EXCEPTION 'Una reduccion sin evento de origen requiere responsable_confirmacion_id'
            USING ERRCODE = 'P0003';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(p_usuario_id::text || ':trust:' || p_rol)::bigint);

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

        v_delta := GREATEST(0, LEAST(v_delta, p_limite_incremento_mes - v_incremento_mes));
    END IF;

    v_nuevo_puntaje := v_actual.puntaje + (CASE WHEN p_tipo = 'incremento' THEN v_delta ELSE -v_delta END);
    v_nuevo_puntaje := GREATEST(0, LEAST(100, v_nuevo_puntaje));

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

COMMIT;