-- ============================================================
-- Migración 0054 — Canjes completos para Persona 5 (Magui)
--
-- Amplía la tabla canjes_recompensa que creó Persona 4 (Miguel)
-- para soportar el ciclo completo del usuario que canjea:
-- reserva de puntos, QR de 48 horas, expiración y reembolsos.
--
-- RETROCOMPATIBILIDAD VERIFICADA:
--   - obtener_mis_recompensas() filtra estado='confirmado' → sin cambio.
--   - _canjes_confirmados() en insignias_aliado_service filtra
--     estado='confirmado' → sin cambio.
--   - confirmar_canje_recompensa() filtra c.estado='emitido' → sin cambio.
--   - emitir_canje_recompensa() inserta con DEFAULT 'emitido' → sin cambio.
--   - Las columnas nuevas son nullable → filas existentes válidas.
--
-- Pendiente de ejecutar manualmente en Supabase antes de desplegar
-- el servicio canjes_service.py (Sección 2).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Nuevas columnas
-- ------------------------------------------------------------

-- Marca cuándo expira el QR. El servicio de Persona 5 la puebla
-- con NOW() + INTERVAL '48 hours' al emitir. El cron de expiración
-- busca canjes con fecha_expiracion < NOW() y estado = 'emitido'.
ALTER TABLE public.canjes_recompensa
    ADD COLUMN IF NOT EXISTS fecha_expiracion timestamptz;

-- Registra el perfil_apoyo que confirmó. Permite auditar qué
-- sucursal/persona física escaneó el QR. Nullable: los canjes
-- emitidos antes de esta migración no tienen confirmador registrado.
ALTER TABLE public.canjes_recompensa
    ADD COLUMN IF NOT EXISTS patrocinador_confirmacion_id uuid
        REFERENCES public.perfil_apoyo(id) ON DELETE SET NULL;

-- Texto libre para cancelaciones (usuario) y reembolsos (admin).
-- Nullable: solo se puebla cuando el estado es 'cancelado' o 'reembolsado'.
ALTER TABLE public.canjes_recompensa
    ADD COLUMN IF NOT EXISTS motivo_cancelacion text;

-- ------------------------------------------------------------
-- 2. Ampliar el CHECK de estados
--
-- Estrategia: DROP + ADD en la misma transacción, dentro del BEGIN/COMMIT.
-- Postgres mantiene la consistencia: si cualquier fila existente
-- violara el nuevo CHECK (imposible porque solo agregamos valores),
-- la transacción entera falla sin modificar nada.
-- ------------------------------------------------------------

ALTER TABLE public.canjes_recompensa
    DROP CONSTRAINT IF EXISTS canjes_recompensa_estado_check;

ALTER TABLE public.canjes_recompensa
    ADD CONSTRAINT canjes_recompensa_estado_check
        CHECK (estado IN ('emitido', 'confirmado', 'cancelado', 'expirado', 'reembolsado'));

-- ------------------------------------------------------------
-- 3. Reemplazar el UNIQUE (recompensa_id, beneficiario_id)
--
-- El constraint original de Miguel impedía que un usuario tuviera
-- más de un canje de la misma recompensa, incluso si el primero
-- había expirado. Con los nuevos estados (expirado, reembolsado,
-- cancelado) una segunda solicitud es legítima.
--
-- Se reemplaza por un índice parcial: solo bloquea duplicados
-- cuando el canje está activo (emitido). Un canje confirmado
-- ya no es "activo" desde la perspectiva del inventario y el
-- usuario podría (si hubiera unidades) volver a solicitar uno.
-- En la práctica el patrocinador controla el inventario real.
-- ------------------------------------------------------------

ALTER TABLE public.canjes_recompensa
    DROP CONSTRAINT IF EXISTS canjes_recompensa_recompensa_id_beneficiario_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS canjes_recompensa_activo_unico
    ON public.canjes_recompensa (recompensa_id, beneficiario_id)
    WHERE estado = 'emitido';

-- ------------------------------------------------------------
-- 4. Índice auxiliar para el cron de expiración
--
-- El cron de Persona 5 consulta todos los canjes en estado
-- 'emitido' cuya fecha_expiracion ya pasó. Sin índice, esa
-- consulta haría un seq scan de toda la tabla. El índice parcial
-- solo indexa las filas candidatas: estado='emitido' con
-- fecha_expiracion no nula.
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS canjes_recompensa_expiracion_idx
    ON public.canjes_recompensa (fecha_expiracion)
    WHERE estado = 'emitido' AND fecha_expiracion IS NOT NULL;

COMMIT;
