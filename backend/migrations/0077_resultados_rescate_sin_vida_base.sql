-- Base de datos para registrar resultados por animal, orientar el contacto y
-- supervisar el seguimiento cuando un animal es encontrado aparentemente sin
-- vida. Esta migracion no conecta todavia endpoints, cron ni notificaciones.

ALTER TYPE public.estado_reporte_enum
  ADD VALUE IF NOT EXISTS 'pendiente_seguimiento_fallecimiento';

BEGIN;

INSERT INTO public.reporte_estados (clave, descripcion, activo)
VALUES (
  'pendiente_seguimiento_fallecimiento',
  'Todos los animales fueron reportados sin vida y el seguimiento sigue pendiente',
  true
)
ON CONFLICT (clave) DO UPDATE
SET descripcion = EXCLUDED.descripcion,
    activo = true;

-- Permite que las tablas nuevas garanticen que cada animal pertenece al
-- reporte indicado mediante una FK compuesta.
CREATE UNIQUE INDEX IF NOT EXISTS animal_id_reporte_id_unico
  ON public.animal(id, reporte_id);

CREATE UNIQUE INDEX IF NOT EXISTS reporte_evidencias_id_reporte_id_unico
  ON public.reporte_evidencias(id, reporte_id);

CREATE TABLE IF NOT EXISTS public.resultados_rescate_animal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid NOT NULL REFERENCES public.reportes(id) ON DELETE CASCADE,
  animal_id uuid NOT NULL,
  reportado_por_id uuid NOT NULL
    REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  evidencia_id uuid NOT NULL,
  estado text NOT NULL DEFAULT 'sin_vida_reportado'
    CHECK (estado IN (
      'sin_vida_reportado',
      'sin_vida_confirmado',
      'duda_estado_critico',
      'evidencia_insuficiente'
    )),
  cantidad_reportada integer NOT NULL DEFAULT 1
    CHECK (cantidad_reportada > 0),
  latitud numeric NOT NULL CHECK (latitud BETWEEN -90 AND 90),
  longitud numeric NOT NULL CHECK (longitud BETWEEN -180 AND 180),
  puede_esperar_seguro boolean NOT NULL,
  riesgo_vial boolean NOT NULL DEFAULT false,
  riesgo_sanitario boolean NOT NULL DEFAULT false,
  identificacion_observada text,
  comentario text,
  motivo_retiro_seguridad text,
  revisado_por_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  revision_notas text,
  reportado_at timestamptz NOT NULL DEFAULT now(),
  revisado_at timestamptz,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resultados_rescate_animal_animal_reporte_fkey
    FOREIGN KEY (animal_id, reporte_id)
    REFERENCES public.animal(id, reporte_id) ON DELETE CASCADE,
  CONSTRAINT resultados_rescate_animal_evidencia_reporte_fkey
    FOREIGN KEY (evidencia_id, reporte_id)
    REFERENCES public.reporte_evidencias(id, reporte_id) ON DELETE RESTRICT,
  CONSTRAINT resultados_rescate_animal_unico UNIQUE (animal_id),
  CONSTRAINT resultados_rescate_animal_id_reporte_unico UNIQUE (id, reporte_id),
  CONSTRAINT resultados_rescate_revision_consistente CHECK (
    (estado = 'sin_vida_reportado' AND revisado_por_id IS NULL AND revisado_at IS NULL)
    OR
    (estado <> 'sin_vida_reportado' AND revisado_por_id IS NOT NULL AND revisado_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS resultados_rescate_reporte_estado_idx
  ON public.resultados_rescate_animal(reporte_id, estado, actualizado_at DESC);

CREATE INDEX IF NOT EXISTS resultados_rescate_revision_pendiente_idx
  ON public.resultados_rescate_animal(reportado_at)
  WHERE estado = 'sin_vida_reportado';

CREATE TABLE IF NOT EXISTS public.contactos_retiro_animal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_clave text NOT NULL,
  municipio_nombre text NOT NULL,
  estado_clave text,
  nombre_servicio text NOT NULL,
  telefono text NOT NULL,
  tipo_servicio text NOT NULL CHECK (tipo_servicio IN (
    'proteccion_animal',
    'control_animal',
    'servicio_municipal',
    'proteccion_civil',
    'policia',
    'otro'
  )),
  horario text,
  fuente text NOT NULL,
  prioridad smallint NOT NULL DEFAULT 100 CHECK (prioridad > 0),
  activo boolean NOT NULL DEFAULT true,
  verificado_at timestamptz NOT NULL,
  verificado_por_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  creado_at timestamptz NOT NULL DEFAULT now(),
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contactos_retiro_municipio_clave_no_vacia
    CHECK (trim(municipio_clave) <> ''),
  CONSTRAINT contactos_retiro_municipio_nombre_no_vacio
    CHECK (trim(municipio_nombre) <> ''),
  CONSTRAINT contactos_retiro_nombre_no_vacio
    CHECK (trim(nombre_servicio) <> ''),
  CONSTRAINT contactos_retiro_telefono_no_vacio
    CHECK (trim(telefono) <> ''),
  CONSTRAINT contactos_retiro_fuente_no_vacia
    CHECK (trim(fuente) <> ''),
  CONSTRAINT contactos_retiro_unico
    UNIQUE (municipio_clave, telefono, tipo_servicio)
);

CREATE INDEX IF NOT EXISTS contactos_retiro_municipio_activo_idx
  ON public.contactos_retiro_animal(
    municipio_clave, activo, prioridad, nombre_servicio
  );

CREATE TABLE IF NOT EXISTS public.seguimientos_fallecimiento_reporte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid NOT NULL UNIQUE
    REFERENCES public.reportes(id) ON DELETE CASCADE,
  asociacion_coordinadora_id uuid
    REFERENCES public.asociaciones(id) ON DELETE SET NULL,
  estado text NOT NULL DEFAULT 'pendiente_voluntario' CHECK (estado IN (
    'pendiente_voluntario',
    'pendiente_asociacion',
    'escalado_administracion',
    'cerrado',
    'reactivado'
  )),
  iniciado_at timestamptz NOT NULL DEFAULT now(),
  asociacion_deadline_at timestamptz NOT NULL,
  administracion_deadline_at timestamptz NOT NULL,
  resultado_final text CHECK (
    resultado_final IS NULL OR resultado_final IN (
      'contacto_realizado',
      'autoridad_atendio',
      'retiro_reportado',
      'retiro_confirmado',
      'sin_contacto_disponible',
      'voluntario_se_retiro_por_seguridad'
    )
  ),
  conclusion_rescate text CHECK (
    conclusion_rescate IS NULL
    OR conclusion_rescate = 'fallecido_antes_de_llegada'
  ),
  cerrado_por_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  cerrado_at timestamptz,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seguimiento_fallecimiento_deadlines_ordenados CHECK (
    asociacion_deadline_at > iniciado_at
    AND administracion_deadline_at > asociacion_deadline_at
  ),
  CONSTRAINT seguimiento_fallecimiento_cierre_consistente CHECK (
    (
      estado = 'cerrado'
      AND resultado_final IS NOT NULL
      AND conclusion_rescate = 'fallecido_antes_de_llegada'
      AND cerrado_por_id IS NOT NULL
      AND cerrado_at IS NOT NULL
    )
    OR
    (
      estado <> 'cerrado'
      AND conclusion_rescate IS NULL
      AND cerrado_por_id IS NULL
      AND cerrado_at IS NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS seguimiento_fallecimiento_asociacion_vencido_idx
  ON public.seguimientos_fallecimiento_reporte(asociacion_deadline_at)
  WHERE estado = 'pendiente_voluntario';

CREATE INDEX IF NOT EXISTS seguimiento_fallecimiento_admin_vencido_idx
  ON public.seguimientos_fallecimiento_reporte(administracion_deadline_at)
  WHERE estado IN ('pendiente_voluntario', 'pendiente_asociacion');

CREATE TABLE IF NOT EXISTS public.seguimientos_retiro_animal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid NOT NULL REFERENCES public.reportes(id) ON DELETE CASCADE,
  resultado_rescate_animal_id uuid NOT NULL,
  registrado_por_id uuid NOT NULL
    REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  tipo_actor text NOT NULL CHECK (tipo_actor IN (
    'voluntario', 'asociacion', 'administracion'
  )),
  accion text NOT NULL CHECK (accion IN (
    'contacto_oficial_realizado',
    'autoridad_se_presento',
    'tercero_responsable_se_hizo_cargo',
    'retiro_gestionado_con_indicaciones',
    'sin_comunicacion',
    'sin_contacto_disponible',
    'retiro_por_seguridad'
  )),
  folio text,
  nombre_servicio text,
  destino_informado text,
  nota text,
  evidencia_lugar_id uuid,
  idempotency_key text NOT NULL,
  registrado_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seguimiento_retiro_resultado_reporte_fkey
    FOREIGN KEY (resultado_rescate_animal_id, reporte_id)
    REFERENCES public.resultados_rescate_animal(id, reporte_id)
    ON DELETE CASCADE,
  CONSTRAINT seguimiento_retiro_evidencia_reporte_fkey
    FOREIGN KEY (evidencia_lugar_id, reporte_id)
    REFERENCES public.reporte_evidencias(id, reporte_id)
    ON DELETE SET NULL,
  CONSTRAINT seguimiento_retiro_idempotencia_unica
    UNIQUE (resultado_rescate_animal_id, idempotency_key),
  CONSTRAINT seguimiento_retiro_idempotencia_no_vacia
    CHECK (trim(idempotency_key) <> ''),
  CONSTRAINT seguimiento_retiro_indicaciones_fuente CHECK (
    accion <> 'retiro_gestionado_con_indicaciones'
    OR NULLIF(trim(nombre_servicio), '') IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS seguimientos_retiro_reporte_fecha_idx
  ON public.seguimientos_retiro_animal(reporte_id, registrado_at DESC);

ALTER TABLE public.resultados_rescate_animal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contactos_retiro_animal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguimientos_fallecimiento_reporte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguimientos_retiro_animal ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON
  public.resultados_rescate_animal,
  public.contactos_retiro_animal,
  public.seguimientos_fallecimiento_reporte,
  public.seguimientos_retiro_animal
FROM anon, authenticated;

GRANT ALL ON
  public.resultados_rescate_animal,
  public.contactos_retiro_animal,
  public.seguimientos_fallecimiento_reporte,
  public.seguimientos_retiro_animal
TO service_role;

COMMENT ON TABLE public.resultados_rescate_animal IS
  'Resultado sensible por animal cuando se encuentra aparentemente sin vida; requiere revision humana.';
COMMENT ON COLUMN public.resultados_rescate_animal.cantidad_reportada IS
  'Cantidad encontrada sin vida dentro de la ficha; para grupos se valida contra animal.cantidad en el servicio.';
COMMENT ON TABLE public.contactos_retiro_animal IS
  'Catalogo administrado de servicios de retiro o atencion por municipio.';
COMMENT ON TABLE public.seguimientos_fallecimiento_reporte IS
  'Reloj y estado de supervision de 24 y 48 horas para un reporte.';
COMMENT ON TABLE public.seguimientos_retiro_animal IS
  'Acciones declaradas por voluntario, asociacion o administracion; no confirman por si solas un retiro.';

NOTIFY pgrst, 'reload schema';

COMMIT;
