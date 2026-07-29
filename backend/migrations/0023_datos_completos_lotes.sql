-- Conserva en los lotes la misma información descriptiva y logística que
-- ya captura el formulario general de aportaciones. `detalle` aloja campos
-- variables por categoría (marca, etapa, dieta, caducidad, foto, etc.).

BEGIN;

ALTER TABLE lotes
    ADD COLUMN IF NOT EXISTS fecha_disponibilidad date,
    ADD COLUMN IF NOT EXISTS vigencia date,
    ADD COLUMN IF NOT EXISTS lugar_entrega varchar(250),
    ADD COLUMN IF NOT EXISTS direccion_entrega varchar(500),
    ADD COLUMN IF NOT EXISTS direccion_detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS detalle jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN lotes.detalle IS
    'Datos variables del recurso: marca, etapa, dieta, estado, caducidad, tamaño y foto_url, entre otros.';
COMMENT ON COLUMN lotes.lugar_entrega IS
    'Punto específico de entrega/recolección del lote, actualmente expresado como latitud,longitud.';
COMMENT ON COLUMN lotes.direccion_entrega IS
    'Dirección legible seleccionada mediante búsqueda o geocodificación inversa del punto de entrega.';
COMMENT ON COLUMN lotes.direccion_detalle IS
    'Dirección estructurada del lote: estado, municipio, calle, codigo_postal y colonia.';

COMMIT;
