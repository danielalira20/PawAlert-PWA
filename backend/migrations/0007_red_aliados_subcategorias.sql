-- Migración: subcategorías de recurso + ajustes a ofertas_proactivas y contribuciones
-- Complementa la migración del módulo Red de Aliados (categoria_recurso, perfil_apoyo, etc.)
-- Ya ejecutada manualmente en Supabase el 23 jul 2026

-- Corrección de nombres en ofertas_proactivas (capacidad_declarada/unidad en vez de cantidad_valor/cantidad_unidad)
ALTER TABLE ofertas_proactivas
    ADD COLUMN capacidad_declarada numeric,
    ADD COLUMN unidad varchar;

UPDATE ofertas_proactivas SET capacidad_declarada = capacidad_disponible, unidad = cantidad_unidad;

ALTER TABLE ofertas_proactivas
    ALTER COLUMN capacidad_declarada SET NOT NULL,
    ALTER COLUMN unidad SET NOT NULL,
    DROP COLUMN cantidad_valor,
    DROP COLUMN cantidad_unidad,
    ADD CONSTRAINT ofertas_proactivas_capacidad_disponible_check CHECK (capacidad_disponible >= 0);

-- Subcategorías de recurso, ligadas a categoria_recurso
CREATE TABLE subcategoria_recurso (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    categoria_id uuid NOT NULL,
    clave varchar NOT NULL,
    descripcion varchar NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    CONSTRAINT subcategoria_recurso_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES categoria_recurso(id),
    CONSTRAINT subcategoria_recurso_categoria_id_clave_key UNIQUE (categoria_id, clave)
);

ALTER TABLE contribuciones ADD COLUMN subcategoria_id uuid;
ALTER TABLE contribuciones ADD CONSTRAINT contribuciones_subcategoria_id_fkey
    FOREIGN KEY (subcategoria_id) REFERENCES subcategoria_recurso(id);

ALTER TABLE ofertas_proactivas ADD COLUMN subcategoria_id uuid;
ALTER TABLE ofertas_proactivas ADD CONSTRAINT ofertas_proactivas_subcategoria_id_fkey
    FOREIGN KEY (subcategoria_id) REFERENCES subcategoria_recurso(id);

-- Catálogo de subcategorías (datos, no solo estructura)
INSERT INTO subcategoria_recurso (categoria_id, clave, descripcion)
SELECT id, v.clave, v.descripcion FROM categoria_recurso, (VALUES
    ('croquetas', 'Croquetas'),
    ('alimento_humedo', 'Alimento húmedo (latas, sobres)'),
    ('formula_crias', 'Fórmula para crías')
) AS v(clave, descripcion)
WHERE categoria_recurso.clave = 'alimentos';

INSERT INTO subcategoria_recurso (categoria_id, clave, descripcion)
SELECT id, v.clave, v.descripcion FROM categoria_recurso, (VALUES
    ('arena_sanitaria', 'Arena sanitaria'),
    ('cobijas', 'Cobijas'),
    ('camas', 'Camas'),
    ('material_limpieza', 'Material de limpieza'),
    ('transportadoras', 'Transportadoras'),
    ('correas', 'Correas'),
    ('collares', 'Collares'),
    ('bozales', 'Bozales'),
    ('kit_medico', 'Kit médico animal'),
    ('material_curacion', 'Material de curación')
) AS v(clave, descripcion)
WHERE categoria_recurso.clave = 'insumos';

INSERT INTO subcategoria_recurso (categoria_id, clave, descripcion)
SELECT id, v.clave, v.descripcion FROM categoria_recurso, (VALUES
    ('consulta', 'Consulta general o de urgencia'),
    ('diagnostico', 'Diagnóstico y estudios'),
    ('medicamentos', 'Medicamentos'),
    ('curaciones_cirugia', 'Curaciones y cirugía'),
    ('hospitalizacion', 'Hospitalización'),
    ('vacunacion_esterilizacion', 'Vacunación y esterilización')
) AS v(clave, descripcion)
WHERE categoria_recurso.clave = 'servicios_veterinarios';

INSERT INTO subcategoria_recurso (categoria_id, clave, descripcion)
SELECT id, v.clave, v.descripcion FROM categoria_recurso, (VALUES
    ('publicidad', 'Publicidad digital o impresa'),
    ('jornadas_comunitarias', 'Jornadas comunitarias'),
    ('espacios_eventos', 'Espacios para eventos'),
    ('servicios_profesionales', 'Servicios profesionales o tecnológicos')
) AS v(clave, descripcion)
WHERE categoria_recurso.clave = 'difusion_campanas';


ALTER TABLE subcategoria_recurso
    ADD COLUMN especies_aplicables text[] DEFAULT ARRAY['perro', 'gato'],
    ADD COLUMN requiere_tamanio boolean NOT NULL DEFAULT false;


-- Alimentos
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['perro','gato'], requiere_tamanio = false WHERE clave = 'croquetas';
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['perro','gato'], requiere_tamanio = false WHERE clave = 'alimento_humedo';
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['perro','gato'], requiere_tamanio = false WHERE clave = 'formula_crias';

-- Insumos
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['gato'], requiere_tamanio = false WHERE clave = 'arena_sanitaria';
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['perro','gato'], requiere_tamanio = false WHERE clave = 'cobijas';
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['perro','gato'], requiere_tamanio = true WHERE clave = 'camas';
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['perro','gato'], requiere_tamanio = false WHERE clave = 'material_limpieza';
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['perro','gato'], requiere_tamanio = true WHERE clave = 'transportadoras';
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['perro'], requiere_tamanio = true WHERE clave = 'correas';
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['perro','gato'], requiere_tamanio = true WHERE clave = 'collares';
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['perro'], requiere_tamanio = true WHERE clave = 'bozales';
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['perro','gato'], requiere_tamanio = false WHERE clave = 'kit_medico';
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['perro','gato'], requiere_tamanio = false WHERE clave = 'material_curacion';

-- Servicios veterinarios
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['perro','gato'], requiere_tamanio = false WHERE clave = 'consulta';
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['perro','gato'], requiere_tamanio = false WHERE clave = 'diagnostico';
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['perro','gato'], requiere_tamanio = false WHERE clave = 'medicamentos';
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['perro','gato'], requiere_tamanio = false WHERE clave = 'curaciones_cirugia';
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['perro','gato'], requiere_tamanio = false WHERE clave = 'hospitalizacion';
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['perro','gato'], requiere_tamanio = false WHERE clave = 'vacunacion_esterilizacion';

-- Difusión y campañas (no aplica realmente por especie, se deja default sin restricción)
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['perro','gato'], requiere_tamanio = false WHERE clave = 'publicidad';
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['perro','gato'], requiere_tamanio = false WHERE clave = 'jornadas_comunitarias';
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['perro','gato'], requiere_tamanio = false WHERE clave = 'espacios_eventos';
UPDATE subcategoria_recurso SET especies_aplicables = ARRAY['perro','gato'], requiere_tamanio = false WHERE clave = 'servicios_profesionales';