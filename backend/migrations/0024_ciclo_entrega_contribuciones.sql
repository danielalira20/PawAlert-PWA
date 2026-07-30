-- Ciclo de confirmación de entrega para contribuciones normales
-- (reactiva/proactiva, no lotes) — reusa el mismo patrón de QR que ya
-- usa lote_asociaciones (migración 0011_lotes_multi_asociacion.sql).

ALTER TABLE contribuciones ADD COLUMN IF NOT EXISTS token uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE contribuciones ADD COLUMN IF NOT EXISTS token_usado boolean NOT NULL DEFAULT false;
ALTER TABLE contribuciones ADD COLUMN IF NOT EXISTS token_expira_at timestamptz;

-- 'entregada' = confirmación física vía QR (confirmar_recepcion_qr_contribucion
-- en red_aliados_service.py), análogo a 'confirmada' en lote_asociaciones.
ALTER TABLE contribuciones DROP CONSTRAINT IF EXISTS contribuciones_estado_check;
ALTER TABLE contribuciones ADD CONSTRAINT contribuciones_estado_check
    CHECK (estado IN ('comprometida', 'confirmada', 'rechazada', 'retirada', 'parcial', 'entregada'));

-- Distingue "notificación nueva" de "ya resuelta" (el aliado ya envió
-- una contribución a la necesidad que generó esta notificación) —
-- independiente de `leida`, que solo indica si se abrió.
ALTER TABLE notificaciones_aliado ADD COLUMN IF NOT EXISTS resuelta boolean NOT NULL DEFAULT false;
ALTER TABLE notificaciones_aliado ADD COLUMN IF NOT EXISTS resuelta_at timestamptz;
