-- Corrige el cruce de tipos dentro de confirmar_incidente_atomico.
--
-- ajustar_trust_score_atomico retorna public.trust_score, pero las versiones
-- 0049/0051 intentaban recibir ese resultado en una variable declarada como
-- public.trust_score_movimientos%ROWTYPE. PostgreSQL convertía los campos por
-- posición y terminaba intentando guardar estado_interno='restringido' en la
-- columna entera valor. La función no usa ese retorno: el movimiento se busca
-- después por regla + evento_origen_id, por lo que corresponde usar PERFORM.

BEGIN;

CREATE OR REPLACE FUNCTION public.confirmar_incidente_atomico(
    p_incidente_id uuid,
    p_confirmado_por uuid
) RETURNS public.incidentes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_incidente public.incidentes%ROWTYPE;
    v_catalogo public.incidente_tipos_catalogo%ROWTYPE;
    -- RECORD porque la consulta agrega valor_reduccion_previo a las columnas
    -- de incidentes; un %ROWTYPE no contiene ese campo calculado.
    v_existente record;
    v_debe_aplicar boolean := true;
    v_regla text;
BEGIN
    SELECT * INTO v_incidente FROM public.incidentes
    WHERE id = p_incidente_id FOR UPDATE;

    IF NOT FOUND OR v_incidente.estado NOT IN ('pendiente', 'requiere_informacion') THEN
        RAISE EXCEPTION 'Incidente no disponible para confirmar' USING ERRCODE = 'P0001';
    END IF;

    IF p_confirmado_por = v_incidente.usuario_id THEN
        RAISE EXCEPTION 'El usuario involucrado no puede confirmar su propio incidente'
            USING ERRCODE = 'P0004';
    END IF;

    SELECT * INTO v_catalogo FROM public.incidente_tipos_catalogo
    WHERE clave = v_incidente.tipo_incidente AND rol = v_incidente.rol AND activo = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tipo de incidente % no valido para rol %', v_incidente.tipo_incidente, v_incidente.rol
            USING ERRCODE = 'P0005';
    END IF;

    v_regla := 'incidente_confirmado_' || v_catalogo.clave;

    IF v_incidente.reporte_id IS NOT NULL THEN
        SELECT i.*, c.valor_reduccion AS valor_reduccion_previo INTO v_existente
        FROM public.incidentes i
        JOIN public.incidente_tipos_catalogo c ON c.clave = i.tipo_incidente AND c.rol = i.rol
        WHERE i.reporte_id = v_incidente.reporte_id
          AND i.usuario_id = v_incidente.usuario_id
          AND i.estado = 'confirmado'
          AND i.id <> v_incidente.id
        ORDER BY c.valor_reduccion DESC
        LIMIT 1;

        IF FOUND THEN
            IF v_existente.valor_reduccion_previo >= v_catalogo.valor_reduccion THEN
                v_debe_aplicar := false;
            ELSE
                PERFORM public.revertir_incidente_atomico(v_existente.id, p_confirmado_por);
            END IF;
        END IF;
    END IF;

    IF v_debe_aplicar THEN
        PERFORM public.ajustar_trust_score_atomico(
            v_incidente.usuario_id, v_incidente.rol, 'reduccion', v_catalogo.valor_reduccion,
            v_regla, v_catalogo.descripcion, 'incidente', v_incidente.id,
            p_confirmado_por, NULL
        );
    END IF;

    UPDATE public.incidentes SET
        estado = 'confirmado',
        confirmado_por = p_confirmado_por,
        trust_score_movimiento_id = CASE WHEN v_debe_aplicar THEN
            (SELECT id FROM public.trust_score_movimientos
             WHERE regla = v_regla AND evento_origen_id = v_incidente.id
             ORDER BY creado_at DESC LIMIT 1)
            ELSE NULL END,
        motivo_resolucion = CASE WHEN NOT v_debe_aplicar THEN
            'Ya existe una reduccion igual o mas grave confirmada sobre este mismo reporte'
            ELSE v_incidente.motivo_resolucion END,
        actualizado_at = now(),
        resuelto_at = now()
    WHERE id = p_incidente_id
    RETURNING * INTO v_incidente;

    RETURN v_incidente;
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_incidente_atomico(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_incidente_atomico(uuid, uuid) TO service_role;

COMMIT;
