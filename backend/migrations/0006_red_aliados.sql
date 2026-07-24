-- Migración: esquema del módulo Red de Aliados
-- Agrega 7 tablas nuevas: categoria_recurso, perfil_apoyo, necesidades,
-- ofertas_proactivas, contribuciones, lotes, notificaciones_aliado
-- Ya ejecutada manualmente en Supabase el 23 jul 2026

-- 1. Catálogo de categorías de recurso
CREATE TABLE categoria_recurso (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clave varchar NOT NULL,
    descripcion varchar NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    CONSTRAINT categoria_recurso_clave_key UNIQUE (clave)
);

-- 2. Perfil complementario de aliado
CREATE TABLE perfil_apoyo (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id uuid NOT NULL,
    tipo varchar NOT NULL,
    categorias text[] NOT NULL DEFAULT '{}',
    zona_cobertura geography(Point),
    radio_km smallint,
    disponibilidad varchar NOT NULL DEFAULT 'disponible',
    niveles_urgencia_atendida text[],
    especies_atendidas text[],
    verificado_admin boolean NOT NULL DEFAULT false,
    verificado_admin_at timestamptz,
    aliado_verificado_por uuid,
    aliado_verificado_at timestamptz,
    preferencia_visibilidad varchar,
    datos_extra jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT perfil_apoyo_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    CONSTRAINT perfil_apoyo_aliado_verificado_por_fkey FOREIGN KEY (aliado_verificado_por) REFERENCES asociaciones(id),
    CONSTRAINT perfil_apoyo_usuario_id_key UNIQUE (usuario_id),
    CONSTRAINT perfil_apoyo_tipo_check CHECK (tipo IN ('donante_comunitario', 'aliado_local', 'patrocinador_institucional')),
    CONSTRAINT perfil_apoyo_disponibilidad_check CHECK (disponibilidad IN ('disponible', 'capacidad_limitada', 'no_disponible'))
);

-- 3. Necesidades publicadas por una asociación
CREATE TABLE necesidades (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    asociacion_id uuid NOT NULL,
    reporte_id uuid,
    categoria varchar NOT NULL,
    urgencia varchar,
    estado varchar NOT NULL DEFAULT 'activa',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT necesidades_asociacion_id_fkey FOREIGN KEY (asociacion_id) REFERENCES asociaciones(id),
    CONSTRAINT necesidades_reporte_id_fkey FOREIGN KEY (reporte_id) REFERENCES reportes(id),
    CONSTRAINT necesidades_urgencia_check CHECK (urgencia IS NULL OR urgencia IN ('critico', 'urgente', 'no_urgente')),
    CONSTRAINT necesidades_estado_check CHECK (estado IN ('activa', 'cubierta', 'vencida', 'cancelada'))
);

-- 4. Ofertas proactivas (independientes hasta que el motor de sugerencias las cruce con algo)
CREATE TABLE ofertas_proactivas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    perfil_apoyo_id uuid NOT NULL,
    categoria varchar NOT NULL,
    capacidad_declarada numeric NOT NULL,
    capacidad_disponible numeric NOT NULL,
    unidad varchar NOT NULL,
    frecuencia varchar,
    detalle jsonb,
    activa boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ofertas_proactivas_perfil_apoyo_id_fkey FOREIGN KEY (perfil_apoyo_id) REFERENCES perfil_apoyo(id),
    CONSTRAINT ofertas_proactivas_capacidad_disponible_check CHECK (capacidad_disponible >= 0)
);

-- 5. Contribuciones (compromiso concreto sobre una necesidad)
CREATE TABLE contribuciones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    necesidad_id uuid NOT NULL,
    usuario_id uuid NOT NULL,
    cantidad_valor numeric,
    cantidad_unidad varchar,
    modo varchar NOT NULL,
    oferta_proactiva_id uuid,
    detalle jsonb,
    estado varchar NOT NULL DEFAULT 'comprometida',
    created_at timestamptz NOT NULL DEFAULT now(),
    confirmada_at timestamptz,
    CONSTRAINT contribuciones_necesidad_id_fkey FOREIGN KEY (necesidad_id) REFERENCES necesidades(id),
    CONSTRAINT contribuciones_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    CONSTRAINT contribuciones_oferta_proactiva_id_fkey FOREIGN KEY (oferta_proactiva_id) REFERENCES ofertas_proactivas(id),
    CONSTRAINT contribuciones_modo_check CHECK (modo IN ('reactiva', 'proactiva')),
    CONSTRAINT contribuciones_estado_check CHECK (estado IN ('comprometida', 'confirmada', 'rechazada', 'retirada', 'parcial'))
);

-- 6. Lotes físicos (extensión de una contribución grande)
CREATE TABLE lotes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contribucion_id uuid NOT NULL,
    tipo_empaque varchar NOT NULL,
    divisible varchar NOT NULL,
    max_asociaciones smallint NOT NULL DEFAULT 1,
    forma_entrega varchar NOT NULL,
    token uuid NOT NULL DEFAULT gen_random_uuid(),
    token_usado boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT lotes_contribucion_id_fkey FOREIGN KEY (contribucion_id) REFERENCES contribuciones(id),
    CONSTRAINT lotes_contribucion_id_key UNIQUE (contribucion_id),
    CONSTRAINT lotes_divisible_check CHECK (divisible IN ('no', 'solo_empaques_completos', 'aliado_prepara_lotes')),
    CONSTRAINT lotes_forma_entrega_check CHECK (forma_entrega IN ('institucion_lleva', 'asociacion_recoge', 'ambas', 'punto_acordado'))
);

-- 7. Notificaciones a aliados (tabla hermana de notificaciones)
CREATE TABLE notificaciones_aliado (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    perfil_apoyo_id uuid NOT NULL,
    necesidad_id uuid NOT NULL,
    tipo varchar NOT NULL DEFAULT 'necesidad_disponible',
    leida boolean NOT NULL DEFAULT false,
    leida_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT notificaciones_aliado_perfil_apoyo_id_fkey FOREIGN KEY (perfil_apoyo_id) REFERENCES perfil_apoyo(id),
    CONSTRAINT notificaciones_aliado_necesidad_id_fkey FOREIGN KEY (necesidad_id) REFERENCES necesidades(id)
);