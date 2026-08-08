-- Sistema de Incidentes (Persona 1 - Jass).
--
-- Reemplaza la puerta directa que hoy tiene ajustar_trust_score_atomico
-- para reducciones: de aqui en adelante ninguna reduccion de trust score
-- debe aplicarse sin pasar por un incidente CONFIRMADO por un tercero.
-- Los incrementos siguen siendo automaticos (no cambian); solo las
-- reducciones requieren este flujo, por decision explicita del
-- documento de asignacion: "nunca descontaran puntos sin confirmacion
-- humana".
--
-- Principio: "una sola consecuencia por incidente" ya viene gratis del
-- UNIQUE(regla, evento_origen_id) de trust_score_movimientos, usando
-- incidentes.id como evento_origen_id. Lo que SI hay que resolver aqui
-- es "una sola consecuencia por REPORTE" cuando hay varios incidentes
-- distintos sobre el mismo caso: eso se resuelve en
-- confirmar_incidente_atomico comparando severidad contra el catalogo.
--
-- Pendiente de ejecutar manualmente en Supabase.

BEGIN;

-- Catalogo de tipos de incidente. Mismo patron que condicion_catalogo /
-- tamanio_catalogo del esquema original: id/clave/descripcion/activo,
-- mas rol y valor_reduccion porque el mismo tipo (ej.
-- 'evidencia_manipulada') tiene distinto peso segun el rol afectado
-- (-30 reportante, -25 voluntario).
CREATE TABLE public.incidente_tipos_catalogo (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clave text NOT NULL,
    rol text NOT NULL CHECK (rol IN ('reportante', 'voluntario_interno', 'voluntario_externo')),
    valor_reduccion integer NOT NULL CHECK (valor_reduccion > 0),
    descripcion text NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    CONSTRAINT incidente_tipos_catalogo_clave_rol_key UNIQUE (clave, rol)
);

INSERT INTO public.incidente_tipos_catalogo (clave, rol, valor_reduccion, descripcion) VALUES
    ('info_incorrecta', 'reportante', 5, 'Informacion importante incorrecta, sin intencion de enganar'),
    ('spam_duplicados', 'reportante', 10, 'Spam o duplicados reiterados tras advertencia'),
    ('reporte_falso', 'reportante', 25, 'Reporte falso confirmado por moderacion'),
    ('evidencia_manipulada', 'reportante', 30, 'Evidencia manipulada o falsificada'),
    ('abuso_grave', 'reportante', 40, 'Abuso grave de la plataforma'),

    ('cancelacion_tardia', 'voluntario_interno', 5, 'Cancelacion tardia injustificada'),
    ('info_operativa_falsa', 'voluntario_interno', 10, 'Informacion operativa falsa'),
    ('abandono', 'voluntario_interno', 15, 'Abandono del caso'),
    ('evidencia_manipulada', 'voluntario_interno', 25, 'Evidencia manipulada'),
    ('conducta_riesgo', 'voluntario_interno', 30, 'Conducta que pone al animal en riesgo'),

    ('cancelacion_tardia', 'voluntario_externo', 5, 'Cancelacion tardia injustificada'),
    ('seguimiento_vencido', 'voluntario_externo', 5, 'Seguimiento obligatorio vencido'),
    ('info_operativa_falsa', 'voluntario_externo', 10, 'Informacion operativa falsa'),
    ('abandono', 'voluntario_externo', 15, 'Abandono del caso'),
    ('evidencia_manipulada', 'voluntario_externo', 25, 'Evidencia manipulada'),
    ('conducta_riesgo', 'voluntario_externo', 30, 'Conducta que pone al animal en riesgo');

CREATE TABLE public.incidentes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
    rol text NOT NULL CHECK (rol IN ('reportante', 'voluntario_interno', 'voluntario_externo')),
    reporte_id uuid REFERENCES public.reportes(id),
    tipo_incidente text NOT NULL,
    descripcion text NOT NULL,
    evidencias jsonb NOT NULL DEFAULT '[]'::jsonb,
    registrado_por uuid NOT NULL REFERENCES public.usuarios(id),
    estado text NOT NULL DEFAULT 'pendiente' CHECK (
        estado IN ('pendiente', 'requiere_informacion', 'confirmado', 'rechazado', 'revertido')
    ),
    confirmado_por uuid REFERENCES public.usuarios(id),
    motivo_resolucion text,
    -- Referencia al movimiento real de trust_score que este incidente
    -- disparo al confirmarse. Queda NULL si el incidente se confirmo
    -- pero se omitio la reduccion por no ser mas grave que otra ya
    -- aplicada sobre el mismo reporte (ver confirmar_incidente_atomico).
    trust_score_movimiento_id uuid REFERENCES public.trust_score_movimientos(id),
    creado_at timestamptz NOT NULL DEFAULT now(),
    actualizado_at timestamptz NOT NULL DEFAULT now(),
    resuelto_at timestamptz,
    CONSTRAINT incidentes_confirmado_por_no_es_afectado CHECK (
        confirmado_por IS NULL OR confirmado_por <> usuario_id
    )
);

CREATE INDEX incidentes_usuario_rol_idx ON public.incidentes(usuario_id, rol);
CREATE INDEX incidentes_reporte_estado_idx ON public.incidentes(reporte_id, estado);
CREATE INDEX incidentes_estado_idx ON public.incidentes(estado);

ALTER TABLE public.incidente_tipos_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidentes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.incidente_tipos_catalogo, public.incidentes FROM anon, authenticated;

-- ============================================================
-- revertir_incidente_atomico
--   Solo aplica sobre un incidente ya confirmado. Genera un movimiento
--   de trust score CONTRARIO (incremento del mismo valor) -- nunca
--   borra el movimiento original de reduccion, coherente con el resto
--   del esquema (append-only). Regla distinta a la del otorgamiento
--   ('incidente_revertido' vs 'incidente_confirmado') para no chocar
--   con el UNIQUE(regla, evento_origen_id). Se define ANTES que
--   confirmar_incidente_atomico porque esta la invoca (ver mas abajo,
--   caso de severidad mayor reemplazando un incidente previo).
-- ============================================================
CREATE OR REPLACE FUNCTION public.revertir_incidente_atomico(
    p_incidente_id uuid,
    p_admin_id uuid
) RETURNS public.incidentes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_incidente public.incidentes%ROWTYPE;
    v_catalogo public.incidente_tipos_catalogo%ROWTYPE;
BEGIN
    SELECT * INTO v_incidente FROM public.incidentes
    WHERE id = p_incidente_id FOR UPDATE;

    IF NOT FOUND OR v_incidente.estado <> 'confirmado' THEN
        RAISE EXCEPTION 'Solo se puede revertir un incidente confirmado' USING ERRCODE = 'P0001';
    END IF;

    -- Si trust_score_movimiento_id es NULL, esta reduccion nunca se
    -- aplico de verdad (quedo "confirmado" pero omitido por severidad,
    -- ver confirmar_incidente_atomico) -- no hay nada que revertir en
    -- trust_score, solo se actualiza el estado del incidente.
    IF v_incidente.trust_score_movimiento_id IS NOT NULL THEN
        SELECT * INTO v_catalogo FROM public.incidente_tipos_catalogo
        WHERE clave = v_incidente.tipo_incidente AND rol = v_incidente.rol;

        PERFORM public.ajustar_trust_score_atomico(
            v_incidente.usuario_id, v_incidente.rol, 'incremento', v_catalogo.valor_reduccion,
            'incidente_revertido', 'Reversion administrativa de incidente', 'incidente',
            v_incidente.id, p_admin_id, NULL
        );
    END IF;

    UPDATE public.incidentes SET
        estado = 'revertido', actualizado_at = now()
    WHERE id = p_incidente_id
    RETURNING * INTO v_incidente;

    RETURN v_incidente;
END;
$$;

-- ============================================================
-- confirmar_incidente_atomico
--   Aplica la reduccion del catalogo, respetando "una sola consecuencia
--   por reporte": si ya existe otro incidente CONFIRMADO sobre el mismo
--   (reporte_id, usuario_id) con severidad >= a la nueva, este incidente
--   se marca confirmado igual (queda en el historial) pero NO dispara
--   una segunda reduccion. Si la nueva es MAS grave, revierte primero
--   la reduccion anterior y aplica la nueva.
-- ============================================================
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
    v_existente public.incidentes%ROWTYPE;
    v_movimiento public.trust_score_movimientos%ROWTYPE;
    v_debe_aplicar boolean := true;
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

    -- Una sola consecuencia por reporte: si ya hay un incidente
    -- confirmado igual o mas grave sobre el mismo caso, no se duplica.
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
                -- La nueva es mas grave: revertir la anterior antes de aplicar esta.
                PERFORM public.revertir_incidente_atomico(v_existente.id, p_confirmado_por);
            END IF;
        END IF;
    END IF;

    IF v_debe_aplicar THEN
        SELECT * INTO v_movimiento FROM public.ajustar_trust_score_atomico(
            v_incidente.usuario_id, v_incidente.rol, 'reduccion', v_catalogo.valor_reduccion,
            'incidente_confirmado', v_catalogo.descripcion, 'incidente', v_incidente.id,
            p_confirmado_por, NULL
        );
    END IF;

    UPDATE public.incidentes SET
        estado = 'confirmado',
        confirmado_por = p_confirmado_por,
        trust_score_movimiento_id = CASE WHEN v_debe_aplicar THEN
            (SELECT id FROM public.trust_score_movimientos
             WHERE regla = 'incidente_confirmado' AND evento_origen_id = v_incidente.id
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
REVOKE ALL ON FUNCTION public.revertir_incidente_atomico(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_incidente_atomico(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.revertir_incidente_atomico(uuid, uuid) TO service_role;

COMMIT;