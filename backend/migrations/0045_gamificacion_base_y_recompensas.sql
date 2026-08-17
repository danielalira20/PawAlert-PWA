-- Migración: base compartida de gamificación (Persona 1 - Jass) + recompensas de aliados (Persona 4 - Miguel)
-- Crea 5 tablas nuevas: movimientos_puntos, trust_score, trust_score_movimientos,
-- insignias, recompensas
-- Pendiente de ejecutar manualmente en Supabase.

BEGIN;

-- 1. Historial de puntos (no se guarda solo un saldo: cada operación queda registrada)
CREATE TABLE public.movimientos_puntos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id uuid NOT NULL,
    rol text NOT NULL,
    tipo_movimiento text NOT NULL,
    puntos integer NOT NULL,
    regla text NOT NULL,
    tipo_origen text NOT NULL,
    evento_origen_id uuid NOT NULL,
    creado_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT movimientos_puntos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    CONSTRAINT movimientos_puntos_tipo_movimiento_check CHECK (tipo_movimiento IN (
        'otorgado', 'reservado', 'confirmado', 'devuelto', 'revertido'
    )),
    CONSTRAINT movimientos_puntos_regla_evento_key UNIQUE (regla, evento_origen_id)
);
CREATE INDEX movimientos_puntos_usuario_id_idx ON public.movimientos_puntos(usuario_id);

-- 2. Trust Score actual, separado por usuario y rol (reportante / voluntario)
CREATE TABLE public.trust_score (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id uuid NOT NULL,
    rol text NOT NULL,
    puntaje integer NOT NULL DEFAULT 60,
    estado_interno text NOT NULL DEFAULT 'normal',
    actualizado_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT trust_score_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    CONSTRAINT trust_score_usuario_rol_key UNIQUE (usuario_id, rol),
    CONSTRAINT trust_score_rol_check CHECK (rol IN ('reportante', 'voluntario')),
    CONSTRAINT trust_score_puntaje_check CHECK (puntaje BETWEEN 0 AND 100)
);

-- 3. Historial de cambios de Trust Score
CREATE TABLE public.trust_score_movimientos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id uuid NOT NULL,
    rol text NOT NULL,
    tipo text NOT NULL,
    valor integer NOT NULL,
    regla text NOT NULL,
    motivo text,
    tipo_origen text NOT NULL,
    evento_origen_id uuid,
    responsable_confirmacion_id uuid,
    creado_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT trust_score_mov_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    CONSTRAINT trust_score_mov_responsable_fkey FOREIGN KEY (responsable_confirmacion_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    CONSTRAINT trust_score_mov_rol_check CHECK (rol IN ('reportante', 'voluntario')),
    CONSTRAINT trust_score_mov_tipo_check CHECK (tipo IN ('incremento', 'reduccion')),
    CONSTRAINT trust_score_mov_regla_evento_key UNIQUE (regla, evento_origen_id)
);
CREATE INDEX trust_score_movimientos_usuario_id_idx ON public.trust_score_movimientos(usuario_id);

-- 4. Insignias, tabla común para todos los roles
CREATE TABLE public.insignias (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id uuid NOT NULL,
    rol text NOT NULL,
    codigo_insignia text NOT NULL,
    nivel text,
    progreso integer NOT NULL DEFAULT 0,
    obtenido_at timestamptz,
    mejorado_at timestamptz,
    CONSTRAINT insignias_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    CONSTRAINT insignias_usuario_rol_codigo_key UNIQUE (usuario_id, rol, codigo_insignia),
    CONSTRAINT insignias_nivel_check CHECK (nivel IS NULL OR nivel IN ('cobre', 'plata', 'oro'))
);
CREATE INDEX insignias_usuario_id_idx ON public.insignias(usuario_id);

-- 5. Recompensas creadas por aliados locales o patrocinadores institucionales verificados
CREATE TABLE public.recompensas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    propietario_id uuid NOT NULL,
    tipo text NOT NULL,
    categoria text NOT NULL,
    subcategoria text,
    nombre text NOT NULL,
    descripcion text NOT NULL,
    nivel text NOT NULL,
    costo integer NOT NULL,
    unidades_totales integer NOT NULL,
    unidades_disponibles integer NOT NULL,
    inicio date NOT NULL,
    vencimiento date NOT NULL,
    sucursal_lugar text,
    horario text,
    forma_entrega text NOT NULL,
    condiciones text,
    estado text NOT NULL DEFAULT 'borrador',
    inventario_separado_confirmado boolean NOT NULL DEFAULT false,
    creado_at timestamptz NOT NULL DEFAULT now(),
    actualizado_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT recompensas_propietario_id_fkey FOREIGN KEY (propietario_id) REFERENCES perfil_apoyo(id),
    CONSTRAINT recompensas_tipo_check CHECK (tipo IN ('descuento', 'producto', 'servicio')),
    CONSTRAINT recompensas_nivel_check CHECK (nivel IN ('pequena', 'mediana', 'grande')),
    CONSTRAINT recompensas_estado_check CHECK (estado IN (
        'borrador', 'activa', 'pausada', 'agotada', 'vencida', 'archivada'
    )),
    CONSTRAINT recompensas_costo_check CHECK (costo > 0),
    CONSTRAINT recompensas_unidades_totales_check CHECK (unidades_totales > 0),
    CONSTRAINT recompensas_unidades_disponibles_check CHECK (
        unidades_disponibles >= 0 AND unidades_disponibles <= unidades_totales
    ),
    CONSTRAINT recompensas_vigencia_check CHECK (
        vencimiento > inicio
        AND (vencimiento - inicio) BETWEEN 30 AND 90
    )
);
CREATE INDEX recompensas_propietario_id_idx ON public.recompensas(propietario_id);
CREATE INDEX recompensas_estado_idx ON public.recompensas(estado);

COMMIT;
