-- Permite que el aliado retire temporalmente un lote de sus aportaciones
-- activas sin borrar su historial ni sus invitaciones.

BEGIN;

ALTER TABLE lotes
    ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS deshabilitado_at timestamptz;

COMMENT ON COLUMN lotes.activo IS
    'Indica si el lote sigue disponible para nuevas invitaciones y asignaciones.';
COMMENT ON COLUMN lotes.deshabilitado_at IS
    'Fecha en que el aliado retiró temporalmente el lote.';

NOTIFY pgrst, 'reload schema';

COMMIT;
