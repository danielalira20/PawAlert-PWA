-- Requisitos base, plantillas de asociaciones, solicitudes de adoptantes y
-- respuestas versionadas. Esta migracion no selecciona adoptantes ni cambia
-- el estado de perfiles; las transiciones se agregan en operaciones atomicas.

BEGIN;

CREATE TABLE IF NOT EXISTS public.requisitos_base_adopcion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  clave text NOT NULL,
  titulo text NOT NULL,
  descripcion text,
  tipo_respuesta text NOT NULL CHECK (tipo_respuesta IN (
    'texto_corto',
    'texto_largo',
    'seleccion_unica',
    'seleccion_multiple',
    'booleano',
    'fecha',
    'documento'
  )),
  opciones jsonb NOT NULL DEFAULT '[]'::jsonb,
  obligatorio boolean NOT NULL DEFAULT true,
  es_sensible boolean NOT NULL DEFAULT false,
  orden smallint NOT NULL CHECK (orden > 0),
  activo boolean NOT NULL DEFAULT true,
  creado_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT requisitos_base_adopcion_version_clave_unica
    UNIQUE (version, clave),
  CONSTRAINT requisitos_base_adopcion_version_no_vacia CHECK (
    trim(version) <> ''
  ),
  CONSTRAINT requisitos_base_adopcion_textos_no_vacios CHECK (
    trim(clave) <> '' AND trim(titulo) <> ''
  ),
  CONSTRAINT requisitos_base_adopcion_opciones_array CHECK (
    jsonb_typeof(opciones) = 'array'
  ),
  CONSTRAINT requisitos_base_adopcion_opciones_consistentes CHECK (
    (
      tipo_respuesta IN ('seleccion_unica', 'seleccion_multiple')
      AND jsonb_array_length(opciones) > 0
    )
    OR
    (
      tipo_respuesta NOT IN ('seleccion_unica', 'seleccion_multiple')
      AND jsonb_array_length(opciones) = 0
    )
  ),
  CONSTRAINT requisitos_base_adopcion_documento_sensible CHECK (
    tipo_respuesta <> 'documento' OR es_sensible = true
  )
);

INSERT INTO public.requisitos_base_adopcion (
  version, clave, titulo, descripcion, tipo_respuesta,
  opciones, obligatorio, es_sensible, orden
)
VALUES
  (
    'pawalert-v1',
    'identidad_mayoria_edad',
    'Identidad y mayoria de edad',
    'Documento oficial utilizado exclusivamente para validar identidad y mayoria de edad.',
    'documento', '[]'::jsonb, true, true, 10
  ),
  (
    'pawalert-v1',
    'domicilio_verificable',
    'Comprobante de domicilio',
    'Documento para validar el domicilio declarado. No se muestra publicamente.',
    'documento', '[]'::jsonb, true, true, 20
  ),
  (
    'pawalert-v1',
    'composicion_hogar',
    'Personas que viven en el hogar',
    'Describe quienes viven en el domicilio y su relacion con el cuidado del animal.',
    'texto_largo', '[]'::jsonb, true, true, 30
  ),
  (
    'pawalert-v1',
    'consentimiento_integrantes',
    'Consentimiento del hogar',
    'Confirma que las personas adultas del hogar conocen y aceptan la adopcion.',
    'booleano', '[]'::jsonb, true, false, 40
  ),
  (
    'pawalert-v1',
    'condiciones_vivienda',
    'Condiciones de vivienda y seguridad',
    'Describe espacios, accesos seguros y condiciones relevantes para el animal.',
    'texto_largo', '[]'::jsonb, true, true, 50
  ),
  (
    'pawalert-v1',
    'animales_hogar',
    'Otros animales en el hogar',
    'Indica especies, edades y cuidados de otros animales que viven en el domicilio.',
    'texto_largo', '[]'::jsonb, true, false, 60
  ),
  (
    'pawalert-v1',
    'compromiso_veterinario',
    'Compromiso de atencion veterinaria',
    'Acepta proporcionar atencion veterinaria preventiva y necesaria.',
    'booleano', '[]'::jsonb, true, false, 70
  ),
  (
    'pawalert-v1',
    'seguimiento_devolucion_responsable',
    'Seguimiento y devolucion responsable',
    'Acepta los seguimientos y contactar a la asociacion antes de abandonar o transferir al animal.',
    'booleano', '[]'::jsonb, true, false, 80
  ),
  (
    'pawalert-v1',
    'veracidad_privacidad',
    'Veracidad y tratamiento de datos',
    'Confirma que la informacion es verdadera y acepta su tratamiento para evaluar la solicitud.',
    'booleano', '[]'::jsonb, true, false, 90
  )
ON CONFLICT (version, clave) DO NOTHING;

CREATE INDEX IF NOT EXISTS requisitos_base_adopcion_version_orden_idx
  ON public.requisitos_base_adopcion(version, activo, orden);

CREATE TABLE IF NOT EXISTS public.plantillas_requisitos_adopcion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asociacion_id uuid NOT NULL
    REFERENCES public.asociaciones(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  nombre text NOT NULL,
  descripcion text,
  requisitos_base_version text NOT NULL DEFAULT 'pawalert-v1',
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN (
    'borrador', 'activa', 'retirada'
  )),
  creada_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  activada_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  activada_at timestamptz,
  retirada_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  retirada_at timestamptz,
  creada_at timestamptz NOT NULL DEFAULT now(),
  actualizada_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plantillas_requisitos_adopcion_version_unica
    UNIQUE (asociacion_id, version),
  CONSTRAINT plantillas_requisitos_adopcion_contexto_unico
    UNIQUE (id, asociacion_id, version),
  CONSTRAINT plantillas_requisitos_adopcion_nombre_no_vacio CHECK (
    trim(nombre) <> '' AND trim(requisitos_base_version) <> ''
  ),
  CONSTRAINT plantillas_requisitos_adopcion_estado_consistente CHECK (
    (
      estado = 'borrador'
      AND activada_por_usuario_id IS NULL
      AND activada_at IS NULL
      AND retirada_por_usuario_id IS NULL
      AND retirada_at IS NULL
    )
    OR
    (
      estado = 'activa'
      AND activada_por_usuario_id IS NOT NULL
      AND activada_at IS NOT NULL
      AND retirada_por_usuario_id IS NULL
      AND retirada_at IS NULL
    )
    OR
    (
      estado = 'retirada'
      AND activada_por_usuario_id IS NOT NULL
      AND activada_at IS NOT NULL
      AND retirada_por_usuario_id IS NOT NULL
      AND retirada_at IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS plantilla_requisitos_adopcion_activa
  ON public.plantillas_requisitos_adopcion(asociacion_id)
  WHERE estado = 'activa';

CREATE TABLE IF NOT EXISTS public.preguntas_requisito_adopcion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plantilla_id uuid NOT NULL
    REFERENCES public.plantillas_requisitos_adopcion(id) ON DELETE CASCADE,
  clave text NOT NULL,
  titulo text NOT NULL,
  descripcion text,
  tipo_respuesta text NOT NULL CHECK (tipo_respuesta IN (
    'texto_corto',
    'texto_largo',
    'seleccion_unica',
    'seleccion_multiple',
    'booleano',
    'fecha',
    'documento'
  )),
  opciones jsonb NOT NULL DEFAULT '[]'::jsonb,
  obligatorio boolean NOT NULL DEFAULT false,
  es_sensible boolean NOT NULL DEFAULT false,
  orden smallint NOT NULL CHECK (orden > 0),
  creada_at timestamptz NOT NULL DEFAULT now(),
  actualizada_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT preguntas_requisito_adopcion_clave_unica
    UNIQUE (plantilla_id, clave),
  CONSTRAINT preguntas_requisito_adopcion_orden_unico
    UNIQUE (plantilla_id, orden),
  CONSTRAINT preguntas_requisito_adopcion_textos_no_vacios CHECK (
    trim(clave) <> '' AND trim(titulo) <> ''
  ),
  CONSTRAINT preguntas_requisito_adopcion_opciones_array CHECK (
    jsonb_typeof(opciones) = 'array'
  ),
  CONSTRAINT preguntas_requisito_adopcion_opciones_consistentes CHECK (
    (
      tipo_respuesta IN ('seleccion_unica', 'seleccion_multiple')
      AND jsonb_array_length(opciones) > 0
    )
    OR
    (
      tipo_respuesta NOT IN ('seleccion_unica', 'seleccion_multiple')
      AND jsonb_array_length(opciones) = 0
    )
  ),
  CONSTRAINT preguntas_requisito_adopcion_documento_sensible CHECK (
    tipo_respuesta <> 'documento' OR es_sensible = true
  )
);

CREATE INDEX IF NOT EXISTS preguntas_requisito_adopcion_plantilla_orden_idx
  ON public.preguntas_requisito_adopcion(plantilla_id, orden);

CREATE UNIQUE INDEX IF NOT EXISTS perfil_adopcion_id_asociacion_unico
  ON public.perfiles_adopcion(id, asociacion_id);

CREATE TABLE IF NOT EXISTS public.solicitudes_adopcion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_adopcion_id uuid NOT NULL,
  asociacion_id uuid NOT NULL,
  solicitante_usuario_id uuid NOT NULL
    REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  plantilla_requisitos_id uuid,
  plantilla_version integer,
  requisitos_base_version text NOT NULL DEFAULT 'pawalert-v1',
  requisitos_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN (
    'borrador',
    'enviada',
    'requiere_informacion',
    'en_evaluacion',
    'entrevista_programada',
    'seleccionada',
    'rechazada',
    'retirada',
    'vencida',
    'cerrada_por_adopcion',
    'adopcion_confirmada'
  )),
  informacion_solicitada text,
  informacion_solicitada_at timestamptz,
  entrevista_programada_at timestamptz,
  entrevista_modalidad text CHECK (
    entrevista_modalidad IS NULL
    OR entrevista_modalidad IN ('presencial', 'remota', 'telefonica')
  ),
  entrevista_detalle_privado text,
  seleccionada_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  seleccionada_at timestamptz,
  motivo_rechazo_interno text,
  categoria_rechazo_publica text,
  rechazada_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  rechazada_at timestamptz,
  retirada_at timestamptz,
  vencimiento_at timestamptz,
  enviada_at timestamptz,
  idempotency_key text NOT NULL,
  creada_at timestamptz NOT NULL DEFAULT now(),
  actualizada_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT solicitudes_adopcion_perfil_asociacion_fkey
    FOREIGN KEY (perfil_adopcion_id, asociacion_id)
    REFERENCES public.perfiles_adopcion(id, asociacion_id)
    ON DELETE RESTRICT,
  CONSTRAINT solicitudes_adopcion_plantilla_contexto_fkey
    FOREIGN KEY (
      plantilla_requisitos_id, asociacion_id, plantilla_version
    ) REFERENCES public.plantillas_requisitos_adopcion(
      id, asociacion_id, version
    ) ON DELETE RESTRICT,
  CONSTRAINT solicitudes_adopcion_plantilla_consistente CHECK (
    (
      plantilla_requisitos_id IS NULL
      AND plantilla_version IS NULL
    )
    OR
    (
      plantilla_requisitos_id IS NOT NULL
      AND plantilla_version IS NOT NULL
    )
  ),
  CONSTRAINT solicitudes_adopcion_snapshot_array CHECK (
    jsonb_typeof(requisitos_snapshot) = 'array'
  ),
  CONSTRAINT solicitudes_adopcion_idempotencia_no_vacia CHECK (
    trim(idempotency_key) <> '' AND trim(requisitos_base_version) <> ''
  ),
  CONSTRAINT solicitudes_adopcion_idempotencia_unica
    UNIQUE (solicitante_usuario_id, idempotency_key),
  CONSTRAINT solicitudes_adopcion_envio_consistente CHECK (
    (estado = 'borrador' AND enviada_at IS NULL)
    OR
    (estado <> 'borrador' AND enviada_at IS NOT NULL)
  ),
  CONSTRAINT solicitudes_adopcion_aclaracion_consistente CHECK (
    estado <> 'requiere_informacion'
    OR (
      NULLIF(trim(informacion_solicitada), '') IS NOT NULL
      AND informacion_solicitada_at IS NOT NULL
    )
  ),
  CONSTRAINT solicitudes_adopcion_entrevista_consistente CHECK (
    estado <> 'entrevista_programada'
    OR (
      entrevista_programada_at IS NOT NULL
      AND entrevista_modalidad IS NOT NULL
    )
  ),
  CONSTRAINT solicitudes_adopcion_seleccion_consistente CHECK (
    (
      estado IN ('seleccionada', 'adopcion_confirmada')
      AND seleccionada_por_usuario_id IS NOT NULL
      AND seleccionada_at IS NOT NULL
    )
    OR
    (
      estado NOT IN ('seleccionada', 'adopcion_confirmada')
      AND seleccionada_por_usuario_id IS NULL
      AND seleccionada_at IS NULL
    )
  ),
  CONSTRAINT solicitudes_adopcion_rechazo_consistente CHECK (
    (
      estado = 'rechazada'
      AND NULLIF(trim(motivo_rechazo_interno), '') IS NOT NULL
      AND NULLIF(trim(categoria_rechazo_publica), '') IS NOT NULL
      AND rechazada_por_usuario_id IS NOT NULL
      AND rechazada_at IS NOT NULL
    )
    OR
    estado <> 'rechazada'
  ),
  CONSTRAINT solicitudes_adopcion_retiro_consistente CHECK (
    estado <> 'retirada' OR retirada_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS solicitud_adopcion_abierta_persona_perfil
  ON public.solicitudes_adopcion(
    perfil_adopcion_id, solicitante_usuario_id
  )
  WHERE estado NOT IN (
    'rechazada',
    'retirada',
    'vencida',
    'cerrada_por_adopcion',
    'adopcion_confirmada'
  );

CREATE UNIQUE INDEX IF NOT EXISTS solicitud_adopcion_seleccionada_perfil
  ON public.solicitudes_adopcion(perfil_adopcion_id)
  WHERE estado = 'seleccionada';

CREATE INDEX IF NOT EXISTS solicitudes_adopcion_asociacion_estado_idx
  ON public.solicitudes_adopcion(
    asociacion_id, estado, actualizada_at DESC
  );

CREATE INDEX IF NOT EXISTS solicitudes_adopcion_solicitante_fecha_idx
  ON public.solicitudes_adopcion(
    solicitante_usuario_id, actualizada_at DESC
  );

CREATE TABLE IF NOT EXISTS public.respuestas_solicitud_adopcion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_adopcion_id uuid NOT NULL
    REFERENCES public.solicitudes_adopcion(id) ON DELETE CASCADE,
  requisito_base_id uuid
    REFERENCES public.requisitos_base_adopcion(id) ON DELETE RESTRICT,
  pregunta_personalizada_id uuid
    REFERENCES public.preguntas_requisito_adopcion(id) ON DELETE RESTRICT,
  pregunta_clave_snapshot text NOT NULL,
  pregunta_texto_snapshot text NOT NULL,
  tipo_respuesta_snapshot text NOT NULL CHECK (
    tipo_respuesta_snapshot IN (
      'texto_corto',
      'texto_largo',
      'seleccion_unica',
      'seleccion_multiple',
      'booleano',
      'fecha',
      'documento'
    )
  ),
  obligatoria_snapshot boolean NOT NULL,
  es_sensible_snapshot boolean NOT NULL DEFAULT false,
  respuesta_json jsonb,
  documento_storage_path text UNIQUE,
  documento_mime_type text,
  documento_size_bytes bigint,
  creada_at timestamptz NOT NULL DEFAULT now(),
  actualizada_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT respuestas_solicitud_adopcion_pregunta_unica
    UNIQUE (solicitud_adopcion_id, pregunta_clave_snapshot),
  CONSTRAINT respuestas_solicitud_adopcion_origen_exclusivo CHECK (
    (requisito_base_id IS NOT NULL)::integer
    + (pregunta_personalizada_id IS NOT NULL)::integer = 1
  ),
  CONSTRAINT respuestas_solicitud_adopcion_snapshot_no_vacio CHECK (
    trim(pregunta_clave_snapshot) <> ''
    AND trim(pregunta_texto_snapshot) <> ''
  ),
  CONSTRAINT respuestas_solicitud_adopcion_documento_consistente CHECK (
    (
      tipo_respuesta_snapshot = 'documento'
      AND respuesta_json IS NULL
      AND documento_storage_path IS NOT NULL
      AND documento_storage_path LIKE 'adopciones/solicitudes/%'
      AND documento_storage_path !~ '(^|/)\.\.(/|$)'
      AND documento_mime_type IN (
        'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
      )
      AND documento_size_bytes > 0
      AND documento_size_bytes <= 10485760
      AND es_sensible_snapshot = true
    )
    OR
    (
      tipo_respuesta_snapshot <> 'documento'
      AND respuesta_json IS NOT NULL
      AND documento_storage_path IS NULL
      AND documento_mime_type IS NULL
      AND documento_size_bytes IS NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS respuestas_solicitud_adopcion_solicitud_idx
  ON public.respuestas_solicitud_adopcion(
    solicitud_adopcion_id, creada_at
  );

ALTER TABLE public.historial_adopcion
  ADD COLUMN IF NOT EXISTS solicitud_adopcion_id uuid
    REFERENCES public.solicitudes_adopcion(id) ON DELETE RESTRICT;

ALTER TABLE public.historial_adopcion
  DROP CONSTRAINT IF EXISTS historial_adopcion_entidad_requerida;

ALTER TABLE public.historial_adopcion
  ADD CONSTRAINT historial_adopcion_entidad_requerida CHECK (
    solicitud_ingreso_id IS NOT NULL
    OR perfil_adopcion_id IS NOT NULL
    OR solicitud_adopcion_id IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS historial_adopcion_solicitud_adopcion_fecha_idx
  ON public.historial_adopcion(solicitud_adopcion_id, creado_at DESC)
  WHERE solicitud_adopcion_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.bloquear_mutacion_requisito_base_adopcion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION
    'Los requisitos base publicados son inmutables; crea una version nueva';
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_mutacion_plantilla_adopcion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.estado <> 'borrador' THEN
      RAISE EXCEPTION
        'Una plantilla publicada no puede eliminarse; debe retirarse';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.estado <> 'borrador' AND (
    NEW.asociacion_id IS DISTINCT FROM OLD.asociacion_id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.nombre IS DISTINCT FROM OLD.nombre
    OR NEW.descripcion IS DISTINCT FROM OLD.descripcion
    OR NEW.requisitos_base_version IS DISTINCT FROM OLD.requisitos_base_version
    OR NEW.creada_por_usuario_id IS DISTINCT FROM OLD.creada_por_usuario_id
    OR NEW.creada_at IS DISTINCT FROM OLD.creada_at
  ) THEN
    RAISE EXCEPTION
      'El contenido de una plantilla publicada es inmutable; crea una version nueva';
  END IF;

  IF OLD.estado = 'retirada' AND NEW.estado IS DISTINCT FROM OLD.estado THEN
    RAISE EXCEPTION
      'Una plantilla retirada no puede reactivarse';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_mutacion_pregunta_adopcion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_estado_anterior text;
  v_estado_nuevo text;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT estado
    INTO v_estado_anterior
    FROM public.plantillas_requisitos_adopcion
    WHERE id = OLD.plantilla_id;

    -- Si la plantilla ya no es visible, el DELETE proviene de su CASCADE.
    IF v_estado_anterior IS NULL AND TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    IF v_estado_anterior IS DISTINCT FROM 'borrador' THEN
      RAISE EXCEPTION
        'Las preguntas solo pueden modificarse mientras la plantilla es borrador';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT estado
    INTO v_estado_nuevo
    FROM public.plantillas_requisitos_adopcion
    WHERE id = NEW.plantilla_id;

    IF v_estado_nuevo IS DISTINCT FROM 'borrador' THEN
      RAISE EXCEPTION
        'Las preguntas solo pueden agregarse a una plantilla en borrador';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER requisitos_base_adopcion_inmutables
BEFORE UPDATE OR DELETE ON public.requisitos_base_adopcion
FOR EACH ROW EXECUTE FUNCTION public.bloquear_mutacion_requisito_base_adopcion();

CREATE TRIGGER plantillas_requisitos_adopcion_mutacion_valida
BEFORE UPDATE OR DELETE ON public.plantillas_requisitos_adopcion
FOR EACH ROW EXECUTE FUNCTION public.validar_mutacion_plantilla_adopcion();

CREATE TRIGGER preguntas_requisito_adopcion_mutacion_valida
BEFORE INSERT OR UPDATE OR DELETE ON public.preguntas_requisito_adopcion
FOR EACH ROW EXECUTE FUNCTION public.validar_mutacion_pregunta_adopcion();

CREATE TRIGGER plantillas_requisitos_adopcion_actualizada_at
BEFORE UPDATE ON public.plantillas_requisitos_adopcion
FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_adopcion();

CREATE TRIGGER preguntas_requisito_adopcion_actualizada_at
BEFORE UPDATE ON public.preguntas_requisito_adopcion
FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_adopcion();

CREATE TRIGGER solicitudes_adopcion_actualizada_at
BEFORE UPDATE ON public.solicitudes_adopcion
FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_adopcion();

CREATE TRIGGER respuestas_solicitud_adopcion_actualizada_at
BEFORE UPDATE ON public.respuestas_solicitud_adopcion
FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_adopcion();

ALTER TABLE public.requisitos_base_adopcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plantillas_requisitos_adopcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preguntas_requisito_adopcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitudes_adopcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.respuestas_solicitud_adopcion ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.requisitos_base_adopcion,
  public.plantillas_requisitos_adopcion,
  public.preguntas_requisito_adopcion,
  public.solicitudes_adopcion,
  public.respuestas_solicitud_adopcion
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  public.requisitos_base_adopcion,
  public.plantillas_requisitos_adopcion,
  public.preguntas_requisito_adopcion,
  public.solicitudes_adopcion,
  public.respuestas_solicitud_adopcion
TO service_role;

REVOKE ALL ON FUNCTION
  public.bloquear_mutacion_requisito_base_adopcion(),
  public.validar_mutacion_plantilla_adopcion(),
  public.validar_mutacion_pregunta_adopcion()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.bloquear_mutacion_requisito_base_adopcion(),
  public.validar_mutacion_plantilla_adopcion(),
  public.validar_mutacion_pregunta_adopcion()
TO service_role;

COMMENT ON TABLE public.requisitos_base_adopcion IS
  'Preguntas obligatorias versionadas por PawAlert; una asociacion no puede eliminarlas de una solicitud.';
COMMENT ON TABLE public.plantillas_requisitos_adopcion IS
  'Versiones de requisitos adicionales definidas por cada asociacion.';
COMMENT ON TABLE public.preguntas_requisito_adopcion IS
  'Preguntas adicionales tipadas; las de documento siempre son sensibles.';
COMMENT ON TABLE public.solicitudes_adopcion IS
  'Solicitud privada de una persona para un perfil publicado, con snapshot de requisitos.';
COMMENT ON TABLE public.respuestas_solicitud_adopcion IS
  'Respuesta versionada; los documentos guardan rutas privadas y nunca URLs firmadas.';

COMMIT;

NOTIFY pgrst, 'reload schema';
