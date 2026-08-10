-- Corrige un riesgo real detectado con Code al trazar
-- calcular_saldo_desglosado_atomico a mano: si alguien llama
-- confirmar_puntos_reservados_atomico con la MISMA regla que uso al
-- reservar (en vez de una distinta, como pedia la documentacion de
-- 0052), el INSERT choca en silencio con el UNIQUE(regla,
-- evento_origen_id) de la fila 'reservado' ya existente.
-- ON CONFLICT DO NOTHING lo descarta sin error, RETURNING * no
-- devuelve nada, y el wrapper Python retorna None -- exactamente el
-- mismo retorno que el caso legitimo "ya se habia confirmado antes".
-- Consecuencia real: esos puntos quedan marcados como "reservado
-- abierto" para siempre en calcular_saldo_desglosado_atomico, aunque
-- el canje ya se haya resuelto.
--
-- En vez de confiar en que quien llame recuerde pasar una regla
-- distinta (riesgo de error humano silencioso), la funcion ahora
-- construye la regla de confirmacion ELLA MISMA, agregando un sufijo
-- fijo. El llamador simplemente pasa la MISMA regla que uso al
-- reservar -- ya no puede equivocarse porque no hay decision que tomar.
--
-- Pendiente de ejecutar manualmente en Supabase.

BEGIN;

CREATE OR REPLACE FUNCTION public.confirmar_puntos_reservados_atomico(
    p_usuario_id uuid,
    p_rol text,
    p_regla text,
    p_tipo_origen text,
    p_evento_origen_id uuid
) RETURNS SETOF public.movimientos_puntos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_regla_confirmacion text;
BEGIN
    -- Sufijo fijo, siempre distinto a cualquier regla de reserva real
    -- (nadie deberia nombrar una regla de reserva terminando en este
    -- sufijo exacto -- si alguien lo hiciera a proposito, es su
    -- problema, no algo que este diseño necesite prevenir).
    v_regla_confirmacion := p_regla || '__confirmado';

    RETURN QUERY
    INSERT INTO public.movimientos_puntos (
        usuario_id, rol, tipo_movimiento, puntos, regla, tipo_origen, evento_origen_id
    ) VALUES (
        p_usuario_id, p_rol, 'confirmado', 0, v_regla_confirmacion, p_tipo_origen, p_evento_origen_id
    )
    ON CONFLICT (regla, evento_origen_id) DO NOTHING
    RETURNING *;
END;
$$;

COMMIT;