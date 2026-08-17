-- Cierra el contrato de puntos que quedo pendiente para Persona 5
-- (canjes): confirmar_puntos_reservados_atomico usa el valor
-- tipo_movimiento='confirmado' que ya existia en el CHECK de 0045
-- desde el inicio, marcado como "informativo, no se usa todavia
-- (Persona 5)" en el comentario original.
--
-- Tambien agrega calcular_saldo_desglosado_atomico: saldo_disponible /
-- saldo_reservado / saldo_total, en vez del solo numero que devolvia
-- consultar_saldo hasta ahora.
--
-- Pendiente de ejecutar manualmente en Supabase.

BEGIN;

-- ============================================================
-- confirmar_puntos_reservados_atomico
--   El paso final del ciclo de un canje: cuando el QR se escanea con
--   exito, la reserva se vuelve DEFINITIVA. No resta saldo de nuevo
--   (eso ya ocurrio al reservar, con puntos en negativo) -- el
--   movimiento 'confirmado' se inserta con puntos=0, es puramente
--   informativo/de auditoria: deja constancia de que esta reserva
--   especifica quedo resuelta como "gastada de verdad" y no como
--   "liberada" (devuelto).
--
--   p_regla debe ser DISTINTA a la regla que se uso al reservar (mismo
--   principio que revertir_puntos_atomico: el UNIQUE(regla,
--   evento_origen_id) exige una combinacion nueva). Convencion sugerida:
--   regla_de_la_reserva + "_confirmado".
--
--   Evento_origen_id debe ser el MISMO que se uso en la reserva (ej. el
--   id del canje) -- es como calcular_saldo_desglosado_atomico
--   reconoce que esa reserva especifica ya quedo resuelta.
-- ============================================================
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
BEGIN
    RETURN QUERY
    INSERT INTO public.movimientos_puntos (
        usuario_id, rol, tipo_movimiento, puntos, regla, tipo_origen, evento_origen_id
    ) VALUES (
        p_usuario_id, p_rol, 'confirmado', 0, p_regla, p_tipo_origen, p_evento_origen_id
    )
    ON CONFLICT (regla, evento_origen_id) DO NOTHING
    RETURNING *;
END;
$$;

-- ============================================================
-- calcular_saldo_desglosado_atomico
--   saldo_disponible: igual que consultar_saldo actual, SUM(puntos)
--     con el convenio de signos ya vigente (otorgado/devuelto suman,
--     reservado/revertido restan). No cambia -- todo el codigo
--     existente que ya llama consultar_saldo() sigue funcionando
--     exactamente igual.
--   saldo_reservado: suma de reservas ABIERTAS -- 'reservado' cuyo
--     evento_origen_id NO tiene todavia un 'confirmado' ni un
--     'devuelto' asociado. Se agrupa por evento_origen_id (no por
--     regla) porque confirmar/devolver usan una regla distinta a la
--     de la reserva original a proposito.
--   saldo_total: disponible + reservado (lo que el usuario "tiene"
--     en sentido amplio, incluyendo lo apartado en canjes pendientes).
-- ============================================================
CREATE OR REPLACE FUNCTION public.calcular_saldo_desglosado_atomico(
    p_usuario_id uuid,
    p_rol text
) RETURNS TABLE(saldo_disponible integer, saldo_reservado integer, saldo_total integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH disponible AS (
        SELECT COALESCE(SUM(puntos), 0) AS monto
        FROM public.movimientos_puntos
        WHERE usuario_id = p_usuario_id AND rol = p_rol
    ),
    reservas_abiertas AS (
        SELECT r.evento_origen_id, abs(r.puntos) AS monto
        FROM public.movimientos_puntos r
        WHERE r.usuario_id = p_usuario_id
          AND r.rol = p_rol
          AND r.tipo_movimiento = 'reservado'
          AND NOT EXISTS (
              SELECT 1 FROM public.movimientos_puntos res
              WHERE res.usuario_id = r.usuario_id
                AND res.rol = r.rol
                AND res.evento_origen_id = r.evento_origen_id
                AND res.tipo_movimiento IN ('confirmado', 'devuelto')
          )
    ),
    reservado AS (
        SELECT COALESCE(SUM(monto), 0) AS monto FROM reservas_abiertas
    )
    SELECT
        disponible.monto::integer AS saldo_disponible,
        reservado.monto::integer AS saldo_reservado,
        (disponible.monto + reservado.monto)::integer AS saldo_total
    FROM disponible, reservado;
$$;

REVOKE ALL ON FUNCTION public.confirmar_puntos_reservados_atomico(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calcular_saldo_desglosado_atomico(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_puntos_reservados_atomico(uuid, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.calcular_saldo_desglosado_atomico(uuid, text) TO service_role;

COMMIT;