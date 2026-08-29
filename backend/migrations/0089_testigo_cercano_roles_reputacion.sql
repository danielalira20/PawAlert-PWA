-- Entrega C (avistamientos): abre trust_score y el Sistema de Incidentes a
-- dos roles que hasta ahora nunca los usaron -- donante_comunitario y
-- patrocinador_institucional -- para poder registrar avistamientos como
-- testigo_cercano (ver avistamiento_service.ROLES_TESTIGO_CERCANO) y, si
-- asociacion confirma uno como falso, recibir la misma consecuencia de
-- reputacion que ya existe para reportante/voluntario_interno.
--
-- reportante y voluntario_interno YA estaban permitidos en estos CHECKs
-- (0047/0049) y no cambian. voluntario_externo tampoco cambia -- ya podia
-- registrar avistamientos por su propio camino (voluntario_verificado) y
-- ya tenia trust_score/incidentes. aliado_local, staff y asociacion
-- quedan fuera a proposito (decision explicita del equipo): no se tocan
-- sus CHECKs.
--
-- trust_score / trust_score_movimientos: los nombres de los CHECK ya se
-- conocen (se fijaron en 0047), asi que se reemplazan directo.
-- incidente_tipos_catalogo / incidentes: sus CHECK de rol quedaron sin
-- nombre explicito en 0049 (Postgres les puso uno generado), asi que se
-- localizan por introspeccion antes de reemplazarlos -- mas seguro que
-- adivinar el nombre y dejar sin querer el CHECK viejo conviviendo con
-- uno nuevo.

BEGIN;

ALTER TABLE public.trust_score
    DROP CONSTRAINT IF EXISTS trust_score_rol_check;
ALTER TABLE public.trust_score
    ADD CONSTRAINT trust_score_rol_check
    CHECK (rol IN (
        'reportante', 'voluntario_interno', 'voluntario_externo',
        'donante_comunitario', 'patrocinador_institucional'
    ));

ALTER TABLE public.trust_score_movimientos
    DROP CONSTRAINT IF EXISTS trust_score_mov_rol_check;
ALTER TABLE public.trust_score_movimientos
    ADD CONSTRAINT trust_score_mov_rol_check
    CHECK (rol IN (
        'reportante', 'voluntario_interno', 'voluntario_externo',
        'donante_comunitario', 'patrocinador_institucional'
    ));

DO $$
DECLARE
    v_nombre text;
BEGIN
    SELECT con.conname INTO v_nombre
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'incidentes' AND att.attname = 'rol' AND con.contype = 'c';

    IF v_nombre IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.incidentes DROP CONSTRAINT %I', v_nombre);
    END IF;
END $$;

ALTER TABLE public.incidentes
    ADD CONSTRAINT incidentes_rol_check
    CHECK (rol IN (
        'reportante', 'voluntario_interno', 'voluntario_externo',
        'donante_comunitario', 'patrocinador_institucional'
    ));

DO $$
DECLARE
    v_nombre text;
BEGIN
    SELECT con.conname INTO v_nombre
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'incidente_tipos_catalogo' AND att.attname = 'rol' AND con.contype = 'c';

    IF v_nombre IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.incidente_tipos_catalogo DROP CONSTRAINT %I', v_nombre);
    END IF;
END $$;

ALTER TABLE public.incidente_tipos_catalogo
    ADD CONSTRAINT incidente_tipos_catalogo_rol_check
    CHECK (rol IN (
        'reportante', 'voluntario_interno', 'voluntario_externo',
        'donante_comunitario', 'patrocinador_institucional'
    ));

-- Catalogo: unica consecuencia de reputacion para testigo_cercano. 20
-- puntos fijos para los 4 roles que hoy pueden usar esta fuente (acordado
-- con el equipo) -- categoria nueva sin historial, asi que no se varia por
-- rol como si se hace en 0049 para catalogos ya existentes.
INSERT INTO public.incidente_tipos_catalogo (clave, rol, valor_reduccion, descripcion) VALUES
    ('avistamiento_falso', 'reportante', 20, 'Avistamiento registrado como testigo cercano, confirmado como falso por la asociación'),
    ('avistamiento_falso', 'voluntario_interno', 20, 'Avistamiento registrado como testigo cercano, confirmado como falso por la asociación'),
    ('avistamiento_falso', 'donante_comunitario', 20, 'Avistamiento registrado como testigo cercano, confirmado como falso por la asociación'),
    ('avistamiento_falso', 'patrocinador_institucional', 20, 'Avistamiento registrado como testigo cercano, confirmado como falso por la asociación');

NOTIFY pgrst, 'reload schema';

COMMIT;
