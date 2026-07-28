-- Documenta columnas de `necesidades` que ya existen en producción pero
-- nunca quedaron registradas en ningún archivo de migración — se agregaron
-- a mano en el editor SQL de Supabase junto con el flujo de
-- crear_necesidad_asociacion() (backend/app/api/associations.py,
-- POST /me/necesidades) y el modelo NecesidadCreate
-- (backend/app/models/red_aliados.py). Confirmado contra el esquema real
-- (OpenAPI de PostgREST) antes de escribir este archivo.
--
-- ADD COLUMN IF NOT EXISTS: no cambia nada en el entorno donde ya existen
-- (no-op), pero deja el esquema completo documentado para cualquier
-- entorno nuevo que se levante desde cero a partir de estas migraciones.

ALTER TABLE necesidades ADD COLUMN IF NOT EXISTS subcategoria_id uuid;
ALTER TABLE necesidades ADD COLUMN IF NOT EXISTS cantidad_valor numeric;
ALTER TABLE necesidades ADD COLUMN IF NOT EXISTS cantidad_unidad varchar;
ALTER TABLE necesidades ADD COLUMN IF NOT EXISTS detalle jsonb;

-- El FK ya existe en producción (confirmado vía PostgREST), pero no hay
-- forma de leer su nombre real exacto desde la API REST (information_schema
-- no está expuesto). Se usa el nombre por default de Postgres para un FK
-- sin nombre explícito, que además coincide con el patrón <tabla>_<columna>_fkey
-- que siguen todos los demás FKs de este proyecto. Si el nombre real fuera
-- distinto, el DROP IF EXISTS es un no-op inofensivo y queda un segundo FK
-- redundante con el mismo efecto — no un error.
ALTER TABLE necesidades DROP CONSTRAINT IF EXISTS necesidades_subcategoria_id_fkey;
ALTER TABLE necesidades ADD CONSTRAINT necesidades_subcategoria_id_fkey
    FOREIGN KEY (subcategoria_id) REFERENCES subcategoria_recurso(id);
