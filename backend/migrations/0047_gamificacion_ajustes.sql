-- Ajustes aditivos sobre 0045_gamificacion_base_y_recompensas.sql (Miguel).
--
-- No modifica ninguna tabla de recompensas ni el diseño original de Miguel.
-- Solo cierra un hueco de validación en movimientos_puntos, agrega índices
-- pensados en las consultas de tope mensual (reportante y voluntario), y
-- documenta en el propio esquema el convenio de signos de puntos, que hasta
-- ahora solo vivía en la conversación del equipo.
--
-- Persona 1 - Jass.

BEGIN;

-- 1. movimientos_puntos.rol no tenía el mismo CHECK que ya existe en
--    trust_score.rol. Solo reportante y voluntario generan puntos según
--    el documento de asignación de tareas — nadie más debería poder
--    insertar aquí un rol de aliado/donante/patrocinador.
--
--    Se distingue voluntario_interno de voluntario_externo (en vez de un
--    'voluntario' genérico) porque el proyecto NO maneja hoy una
--    transición de externo a interno (ni viceversa) dentro de la misma
--    cuenta: una cuenta nace en uno de los dos y se queda ahí. Al no
--    existir esa transición, no hay riesgo de "resetear" confianza al
--    cambiar de tipo, y separar evita mezclar en la misma fila reglas e
--    insignias que en el documento de asignación son exclusivas de un
--    subtipo (ej. "verificación de hogar" y "verificador de confianza"
--    solo aplican a interno; "seguimiento de casa temporal" y "casa
--    segura" solo a externo).
ALTER TABLE public.movimientos_puntos
    ADD CONSTRAINT movimientos_puntos_rol_check
    CHECK (rol IN ('reportante', 'voluntario_interno', 'voluntario_externo'));

-- 1b. Corrección al CHECK que Miguel dejó en 0045 para trust_score /
--     trust_score_movimientos (rol IN ('reportante','voluntario')).
--     Aunque 0045 ya está corrida en Supabase, ambas tablas siguen
--     vacías (nadie ha escrito ahí todavía), así que este ALTER no migra
--     datos, solo corrige la restricción antes de que Persona 2/3
--     empiecen a insertar. Avisar a Miguel de este cambio antes de
--     correr esta migración.
ALTER TABLE public.trust_score
    DROP CONSTRAINT IF EXISTS trust_score_rol_check;
ALTER TABLE public.trust_score
    ADD CONSTRAINT trust_score_rol_check
    CHECK (rol IN ('reportante', 'voluntario_interno', 'voluntario_externo'));

ALTER TABLE public.trust_score_movimientos
    DROP CONSTRAINT IF EXISTS trust_score_mov_rol_check;
ALTER TABLE public.trust_score_movimientos
    ADD CONSTRAINT trust_score_mov_rol_check
    CHECK (rol IN ('reportante', 'voluntario_interno', 'voluntario_externo'));

-- 2. Índices compuestos para las consultas de tope mensual que van a correr
--    en cada llamada de otorgar_puntos / ajustar_trust_score:
--    "¿cuántos puntos/cuánto trust ganó este usuario, en este rol, en los
--    últimos 30 días, por esta regla?". Sin esto, cada verificación de tope
--    escanea toda la tabla por usuario_id.
CREATE INDEX movimientos_puntos_usuario_rol_fecha_idx
    ON public.movimientos_puntos(usuario_id, rol, creado_at);

CREATE INDEX trust_score_movimientos_usuario_rol_fecha_idx
    ON public.trust_score_movimientos(usuario_id, rol, creado_at);

-- 3. Convenio de signos de movimientos_puntos, documentado en el propio
--    esquema para que no dependa de que alguien recuerde una conversación.
--    consultar_saldo() se calcula como SUM(puntos) sobre este convenio.
COMMENT ON COLUMN public.movimientos_puntos.puntos IS
    'Convenio de signos por tipo_movimiento (aplicado por la capa de '
    'servicio, no por CHECK, porque depende del tipo):
     otorgado    -> positivo, suma directa al saldo (ej. bono bienvenida).
     reservado   -> negativo, aparta saldo para un canje en curso.
     confirmado  -> cero o registro informativo; el descuento real ya
                    ocurrió en el movimiento "reservado" correspondiente,
                    esto solo deja la evidencia final de que el canje se
                    completó (referencia al mismo evento_origen_id que la
                    reserva, distinta regla).
     devuelto    -> positivo, revierte una reserva (ej. QR expirado o
                    cancelado antes de confirmarse).
     revertido   -> negativo, corrección administrativa por fraude
                    comprobado sobre puntos ya otorgados.';

COMMENT ON TABLE public.movimientos_puntos IS
    'Historial append-only de puntos de gamificación. No existe columna de '
    'saldo: se calcula siempre con SUM(puntos) filtrando por usuario_id y '
    'rol. UNIQUE(regla, evento_origen_id) es lo que impide otorgar el mismo '
    'movimiento dos veces para el mismo evento.';

COMMIT;