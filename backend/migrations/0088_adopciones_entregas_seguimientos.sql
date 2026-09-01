-- Entregas, confirmaciones independientes, seguimientos posteriores y alertas
-- de bienestar. Esta migracion solo crea persistencia: no completa adopciones,
-- no cierra custodias y no modifica perfiles ni solicitudes.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS solicitud_adopcion_contexto_entrega_unico
  ON public.solicitudes_adopcion(
    id, perfil_adopcion_id, asociacion_id, solicitante_usuario_id
  );

CREATE TABLE IF NOT EXISTS public.entregas_adopcion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_adopcion_id uuid NOT NULL,
  solicitud_adopcion_id uuid NOT NULL,
  asociacion_id uuid NOT NULL,
  adoptante_usuario_id uuid NOT NULL,
  estado text NOT NULL DEFAULT 'por_programar' CHECK (estado IN (
    'por_programar',
    'programada',
    'confirmacion_parcial',
    'completada',
    'cancelada'
  )),
  modalidad text CHECK (
    modalidad IS NULL OR modalidad IN (
      'sede_asociacion',
      'domicilio_adoptante',
      'punto_acordado',
      'otra'
    )
  ),
  programada_inicio_at timestamptz,
  programada_fin_at timestamptz,
  lugar_privado text,
  instrucciones_privadas text,
  responsable_entrega_tipo text CHECK (
    responsable_entrega_tipo IS NULL
    OR responsable_entrega_tipo IN ('asociacion', 'casa_temporal')
  ),
  responsable_entrega_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  representante_asociacion_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  acuerdo_storage_path text UNIQUE,
  acuerdo_mime_type text,
  acuerdo_size_bytes bigint,
  programada_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  programada_at timestamptz,
  completada_at timestamptz,
  cancelada_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  cancelada_at timestamptz,
  motivo_cancelacion text,
  idempotency_key text NOT NULL,
  creada_at timestamptz NOT NULL DEFAULT now(),
  actualizada_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entregas_adopcion_solicitud_contexto_fkey
    FOREIGN KEY (
      solicitud_adopcion_id,
      perfil_adopcion_id,
      asociacion_id,
      adoptante_usuario_id
    ) REFERENCES public.solicitudes_adopcion(
      id, perfil_adopcion_id, asociacion_id, solicitante_usuario_id
    ) ON DELETE RESTRICT,
  CONSTRAINT entregas_adopcion_contexto_unico
    UNIQUE (
      id,
      perfil_adopcion_id,
      solicitud_adopcion_id,
      asociacion_id,
      adoptante_usuario_id
    ),
  CONSTRAINT entregas_adopcion_alerta_contexto_unico
    UNIQUE (id, perfil_adopcion_id, asociacion_id),
  CONSTRAINT entregas_adopcion_idempotencia_unica
    UNIQUE (asociacion_id, idempotency_key),
  CONSTRAINT entregas_adopcion_idempotencia_no_vacia CHECK (
    trim(idempotency_key) <> ''
  ),
  CONSTRAINT entregas_adopcion_programacion_consistente CHECK (
    (
      estado IN ('por_programar', 'cancelada')
      AND modalidad IS NULL
      AND programada_inicio_at IS NULL
      AND programada_fin_at IS NULL
      AND lugar_privado IS NULL
      AND responsable_entrega_tipo IS NULL
      AND responsable_entrega_usuario_id IS NULL
      AND representante_asociacion_usuario_id IS NULL
      AND programada_por_usuario_id IS NULL
      AND programada_at IS NULL
    )
    OR
    (
      estado IN (
        'programada', 'confirmacion_parcial', 'completada', 'cancelada'
      )
      AND modalidad IS NOT NULL
      AND programada_inicio_at IS NOT NULL
      AND programada_fin_at IS NOT NULL
      AND programada_fin_at > programada_inicio_at
      AND NULLIF(trim(lugar_privado), '') IS NOT NULL
      AND responsable_entrega_tipo IS NOT NULL
      AND responsable_entrega_usuario_id IS NOT NULL
      AND representante_asociacion_usuario_id IS NOT NULL
      AND programada_por_usuario_id IS NOT NULL
      AND programada_at IS NOT NULL
    )
  ),
  CONSTRAINT entregas_adopcion_acuerdo_privado CHECK (
    (
      acuerdo_storage_path IS NULL
      AND acuerdo_mime_type IS NULL
      AND acuerdo_size_bytes IS NULL
    )
    OR
    (
      acuerdo_storage_path LIKE 'adopciones/entregas/%'
      AND acuerdo_storage_path !~ '(^|/)\.\.(/|$)'
      AND acuerdo_mime_type IS NOT NULL
      AND acuerdo_mime_type IN (
        'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
      )
      AND acuerdo_size_bytes IS NOT NULL
      AND acuerdo_size_bytes > 0
      AND acuerdo_size_bytes <= 10485760
    )
  ),
  CONSTRAINT entregas_adopcion_completada_consistente CHECK (
    estado <> 'completada' OR completada_at IS NOT NULL
  ),
  CONSTRAINT entregas_adopcion_cancelacion_consistente CHECK (
    (
      estado = 'cancelada'
      AND cancelada_por_usuario_id IS NOT NULL
      AND cancelada_at IS NOT NULL
      AND NULLIF(trim(motivo_cancelacion), '') IS NOT NULL
    )
    OR estado <> 'cancelada'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS entrega_adopcion_activa_por_perfil
  ON public.entregas_adopcion(perfil_adopcion_id)
  WHERE estado IN (
    'por_programar', 'programada', 'confirmacion_parcial'
  );

CREATE UNIQUE INDEX IF NOT EXISTS entrega_adopcion_activa_por_solicitud
  ON public.entregas_adopcion(solicitud_adopcion_id)
  WHERE estado IN (
    'por_programar', 'programada', 'confirmacion_parcial'
  );

CREATE INDEX IF NOT EXISTS entregas_adopcion_asociacion_estado_idx
  ON public.entregas_adopcion(
    asociacion_id, estado, programada_inicio_at
  );

CREATE TABLE IF NOT EXISTS public.confirmaciones_entrega_adopcion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_adopcion_id uuid NOT NULL
    REFERENCES public.entregas_adopcion(id) ON DELETE RESTRICT,
  tipo_confirmacion text NOT NULL CHECK (tipo_confirmacion IN (
    'recepcion_adoptante',
    'entrega_responsable',
    'validacion_asociacion'
  )),
  actor_usuario_id uuid NOT NULL
    REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  observaciones text,
  evidencia_storage_path text UNIQUE,
  evidencia_mime_type text,
  evidencia_size_bytes bigint,
  idempotency_key text NOT NULL,
  confirmada_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT confirmaciones_entrega_adopcion_tipo_unico
    UNIQUE (entrega_adopcion_id, tipo_confirmacion),
  CONSTRAINT confirmaciones_entrega_adopcion_idempotencia_unica
    UNIQUE (actor_usuario_id, idempotency_key),
  CONSTRAINT confirmaciones_entrega_adopcion_idempotencia_no_vacia CHECK (
    trim(idempotency_key) <> ''
  ),
  CONSTRAINT confirmaciones_entrega_adopcion_evidencia_privada CHECK (
    (
      evidencia_storage_path IS NULL
      AND evidencia_mime_type IS NULL
      AND evidencia_size_bytes IS NULL
    )
    OR
    (
      evidencia_storage_path LIKE 'adopciones/entregas/%'
      AND evidencia_storage_path !~ '(^|/)\.\.(/|$)'
      AND evidencia_mime_type IS NOT NULL
      AND evidencia_mime_type IN (
        'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
      )
      AND evidencia_size_bytes IS NOT NULL
      AND evidencia_size_bytes > 0
      AND evidencia_size_bytes <= 10485760
    )
  )
);

CREATE INDEX IF NOT EXISTS confirmaciones_entrega_adopcion_entrega_idx
  ON public.confirmaciones_entrega_adopcion(
    entrega_adopcion_id, confirmada_at
  );

CREATE TABLE IF NOT EXISTS public.seguimientos_adopcion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_adopcion_id uuid NOT NULL
    REFERENCES public.entregas_adopcion(id) ON DELETE RESTRICT,
  perfil_adopcion_id uuid NOT NULL
    REFERENCES public.perfiles_adopcion(id) ON DELETE RESTRICT,
  solicitud_adopcion_id uuid NOT NULL
    REFERENCES public.solicitudes_adopcion(id) ON DELETE RESTRICT,
  asociacion_id uuid NOT NULL
    REFERENCES public.asociaciones(id) ON DELETE RESTRICT,
  adoptante_usuario_id uuid NOT NULL
    REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  dia_objetivo smallint NOT NULL CHECK (dia_objetivo IN (7, 30, 90)),
  objetivo_at timestamptz NOT NULL,
  recordatorio_at timestamptz NOT NULL,
  vencimiento_at timestamptz NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN (
    'pendiente',
    'respondido',
    'validado',
    'requiere_contacto',
    'vencido',
    'cerrado'
  )),
  respuesta_json jsonb,
  comentario_adoptante text,
  respondido_at timestamptz,
  validado_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  validado_at timestamptz,
  contacto_motivo text,
  requiere_contacto_at timestamptz,
  vencido_at timestamptz,
  cerrado_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  cerrado_at timestamptz,
  motivo_cierre text,
  creada_at timestamptz NOT NULL DEFAULT now(),
  actualizada_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seguimientos_adopcion_hito_unico
    UNIQUE (entrega_adopcion_id, dia_objetivo),
  CONSTRAINT seguimientos_adopcion_alerta_contexto_unico
    UNIQUE (
      id, entrega_adopcion_id, perfil_adopcion_id, asociacion_id
    ),
  CONSTRAINT seguimientos_adopcion_contexto_entrega_fkey
    FOREIGN KEY (
      entrega_adopcion_id,
      perfil_adopcion_id,
      solicitud_adopcion_id,
      asociacion_id,
      adoptante_usuario_id
    ) REFERENCES public.entregas_adopcion(
      id,
      perfil_adopcion_id,
      solicitud_adopcion_id,
      asociacion_id,
      adoptante_usuario_id
    ) ON DELETE RESTRICT,
  CONSTRAINT seguimientos_adopcion_fechas_consistentes CHECK (
    recordatorio_at = objetivo_at + interval '48 hours'
    AND vencimiento_at = objetivo_at + interval '7 days'
  ),
  CONSTRAINT seguimientos_adopcion_respuesta_consistente CHECK (
    estado NOT IN ('respondido', 'validado')
    OR (
      respuesta_json IS NOT NULL
      AND jsonb_typeof(respuesta_json) = 'object'
      AND respondido_at IS NOT NULL
    )
  ),
  CONSTRAINT seguimientos_adopcion_respuesta_objeto CHECK (
    respuesta_json IS NULL OR jsonb_typeof(respuesta_json) = 'object'
  ),
  CONSTRAINT seguimientos_adopcion_validacion_consistente CHECK (
    estado <> 'validado'
    OR (
      validado_por_usuario_id IS NOT NULL
      AND validado_at IS NOT NULL
    )
  ),
  CONSTRAINT seguimientos_adopcion_contacto_consistente CHECK (
    estado <> 'requiere_contacto'
    OR (
      NULLIF(trim(contacto_motivo), '') IS NOT NULL
      AND requiere_contacto_at IS NOT NULL
    )
  ),
  CONSTRAINT seguimientos_adopcion_vencimiento_consistente CHECK (
    estado <> 'vencido' OR vencido_at IS NOT NULL
  ),
  CONSTRAINT seguimientos_adopcion_cierre_consistente CHECK (
    estado <> 'cerrado'
    OR (
      cerrado_por_usuario_id IS NOT NULL
      AND cerrado_at IS NOT NULL
      AND NULLIF(trim(motivo_cierre), '') IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS seguimientos_adopcion_pendientes_idx
  ON public.seguimientos_adopcion(estado, objetivo_at)
  WHERE estado IN ('pendiente', 'respondido', 'requiere_contacto');

CREATE INDEX IF NOT EXISTS seguimientos_adopcion_asociacion_idx
  ON public.seguimientos_adopcion(
    asociacion_id, estado, objetivo_at
  );

CREATE TABLE IF NOT EXISTS public.evidencias_seguimiento_adopcion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seguimiento_adopcion_id uuid NOT NULL
    REFERENCES public.seguimientos_adopcion(id) ON DELETE RESTRICT,
  subida_por_usuario_id uuid NOT NULL
    REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN (
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
  )),
  size_bytes bigint NOT NULL CHECK (
    size_bytes > 0 AND size_bytes <= 10485760
  ),
  descripcion text,
  creada_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evidencias_seguimiento_adopcion_path_privado CHECK (
    storage_path LIKE 'adopciones/seguimientos/%'
    AND storage_path !~ '(^|/)\.\.(/|$)'
  )
);

CREATE INDEX IF NOT EXISTS evidencias_seguimiento_adopcion_seguimiento_idx
  ON public.evidencias_seguimiento_adopcion(
    seguimiento_adopcion_id, creada_at
  );

CREATE TABLE IF NOT EXISTS public.alertas_bienestar_adopcion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seguimiento_adopcion_id uuid
    REFERENCES public.seguimientos_adopcion(id) ON DELETE RESTRICT,
  entrega_adopcion_id uuid NOT NULL
    REFERENCES public.entregas_adopcion(id) ON DELETE RESTRICT,
  perfil_adopcion_id uuid NOT NULL
    REFERENCES public.perfiles_adopcion(id) ON DELETE RESTRICT,
  asociacion_id uuid NOT NULL
    REFERENCES public.asociaciones(id) ON DELETE RESTRICT,
  reportada_por_usuario_id uuid NOT NULL
    REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  severidad text NOT NULL CHECK (severidad IN (
    'observacion', 'preocupante', 'critica'
  )),
  descripcion text NOT NULL,
  estado text NOT NULL DEFAULT 'abierta' CHECK (estado IN (
    'abierta', 'en_atencion', 'escalada_admin', 'resuelta'
  )),
  atender_antes_de timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  atendida_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  atendida_at timestamptz,
  escalada_at timestamptz,
  escalada_motivo text,
  resuelta_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  resuelta_at timestamptz,
  resolucion text,
  idempotency_key text NOT NULL,
  creada_at timestamptz NOT NULL DEFAULT now(),
  actualizada_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alertas_bienestar_adopcion_contexto_entrega_fkey
    FOREIGN KEY (
      entrega_adopcion_id, perfil_adopcion_id, asociacion_id
    ) REFERENCES public.entregas_adopcion(
      id, perfil_adopcion_id, asociacion_id
    ) ON DELETE RESTRICT,
  CONSTRAINT alertas_bienestar_adopcion_contexto_seguimiento_fkey
    FOREIGN KEY (
      seguimiento_adopcion_id,
      entrega_adopcion_id,
      perfil_adopcion_id,
      asociacion_id
    ) REFERENCES public.seguimientos_adopcion(
      id, entrega_adopcion_id, perfil_adopcion_id, asociacion_id
    ) ON DELETE RESTRICT,
  CONSTRAINT alertas_bienestar_adopcion_idempotencia_unica
    UNIQUE (reportada_por_usuario_id, idempotency_key),
  CONSTRAINT alertas_bienestar_adopcion_textos_no_vacios CHECK (
    trim(descripcion) <> '' AND trim(idempotency_key) <> ''
  ),
  CONSTRAINT alertas_bienestar_adopcion_atencion_consistente CHECK (
    estado <> 'en_atencion'
    OR (
      atendida_por_usuario_id IS NOT NULL
      AND atendida_at IS NOT NULL
    )
  ),
  CONSTRAINT alertas_bienestar_adopcion_escalamiento_consistente CHECK (
    estado <> 'escalada_admin'
    OR (
      escalada_at IS NOT NULL
      AND NULLIF(trim(escalada_motivo), '') IS NOT NULL
    )
  ),
  CONSTRAINT alertas_bienestar_adopcion_resolucion_consistente CHECK (
    estado <> 'resuelta'
    OR (
      resuelta_por_usuario_id IS NOT NULL
      AND resuelta_at IS NOT NULL
      AND NULLIF(trim(resolucion), '') IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS alertas_bienestar_adopcion_pendientes_idx
  ON public.alertas_bienestar_adopcion(
    estado, atender_antes_de
  )
  WHERE estado IN ('abierta', 'en_atencion');

CREATE INDEX IF NOT EXISTS alertas_bienestar_adopcion_asociacion_idx
  ON public.alertas_bienestar_adopcion(
    asociacion_id, estado, creada_at DESC
  );

ALTER TABLE public.historial_adopcion
  ADD COLUMN IF NOT EXISTS entrega_adopcion_id uuid
    REFERENCES public.entregas_adopcion(id) ON DELETE RESTRICT;

ALTER TABLE public.historial_adopcion
  ADD COLUMN IF NOT EXISTS seguimiento_adopcion_id uuid
    REFERENCES public.seguimientos_adopcion(id) ON DELETE RESTRICT;

ALTER TABLE public.historial_adopcion
  ADD COLUMN IF NOT EXISTS alerta_bienestar_adopcion_id uuid
    REFERENCES public.alertas_bienestar_adopcion(id) ON DELETE RESTRICT;

ALTER TABLE public.historial_adopcion
  DROP CONSTRAINT IF EXISTS historial_adopcion_entidad_requerida;

ALTER TABLE public.historial_adopcion
  ADD CONSTRAINT historial_adopcion_entidad_requerida CHECK (
    solicitud_ingreso_id IS NOT NULL
    OR perfil_adopcion_id IS NOT NULL
    OR solicitud_adopcion_id IS NOT NULL
    OR entrega_adopcion_id IS NOT NULL
    OR seguimiento_adopcion_id IS NOT NULL
    OR alerta_bienestar_adopcion_id IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS historial_adopcion_entrega_fecha_idx
  ON public.historial_adopcion(entrega_adopcion_id, creado_at DESC)
  WHERE entrega_adopcion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS historial_adopcion_seguimiento_fecha_idx
  ON public.historial_adopcion(seguimiento_adopcion_id, creado_at DESC)
  WHERE seguimiento_adopcion_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.bloquear_mutacion_confirmacion_entrega_adopcion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION
    'Una confirmacion de entrega es inmutable; registra una incidencia para corregirla';
END;
$$;

CREATE OR REPLACE FUNCTION public.actualizar_timestamp_perfil_adopcion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.actualizado_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS perfiles_adopcion_actualizado_at
ON public.perfiles_adopcion;

CREATE TRIGGER perfiles_adopcion_actualizado_at
BEFORE UPDATE ON public.perfiles_adopcion
FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_perfil_adopcion();

CREATE TRIGGER entregas_adopcion_actualizada_at
BEFORE UPDATE ON public.entregas_adopcion
FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_adopcion();

CREATE TRIGGER seguimientos_adopcion_actualizada_at
BEFORE UPDATE ON public.seguimientos_adopcion
FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_adopcion();

CREATE TRIGGER alertas_bienestar_adopcion_actualizada_at
BEFORE UPDATE ON public.alertas_bienestar_adopcion
FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_adopcion();

CREATE TRIGGER confirmaciones_entrega_adopcion_inmutables
BEFORE UPDATE OR DELETE ON public.confirmaciones_entrega_adopcion
FOR EACH ROW EXECUTE FUNCTION public.bloquear_mutacion_confirmacion_entrega_adopcion();

ALTER TABLE public.entregas_adopcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.confirmaciones_entrega_adopcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguimientos_adopcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidencias_seguimiento_adopcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas_bienestar_adopcion ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.entregas_adopcion,
  public.confirmaciones_entrega_adopcion,
  public.seguimientos_adopcion,
  public.evidencias_seguimiento_adopcion,
  public.alertas_bienestar_adopcion
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  public.entregas_adopcion,
  public.confirmaciones_entrega_adopcion,
  public.seguimientos_adopcion,
  public.evidencias_seguimiento_adopcion,
  public.alertas_bienestar_adopcion
TO service_role;

REVOKE ALL ON FUNCTION
  public.bloquear_mutacion_confirmacion_entrega_adopcion(),
  public.actualizar_timestamp_perfil_adopcion()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.bloquear_mutacion_confirmacion_entrega_adopcion(),
  public.actualizar_timestamp_perfil_adopcion()
TO service_role;

COMMENT ON TABLE public.entregas_adopcion IS
  'Entrega privada de una solicitud seleccionada; completarla requiere una operacion atomica posterior.';
COMMENT ON TABLE public.confirmaciones_entrega_adopcion IS
  'Marcas independientes e inmutables del adoptante, quien entrega y la asociacion coordinadora.';
COMMENT ON TABLE public.seguimientos_adopcion IS
  'Seguimientos programados exactamente a 7, 30 y 90 dias despues de una entrega completada.';
COMMENT ON TABLE public.alertas_bienestar_adopcion IS
  'Alertas explicitas que requieren atencion de la asociacion y escalamiento administrativo a las 48 horas.';

COMMIT;

NOTIFY pgrst, 'reload schema';
