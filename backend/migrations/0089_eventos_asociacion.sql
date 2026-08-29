-- Eventos publicos organizados por asociaciones, colaboradores, perfiles de
-- adopcion vinculados, eventos guardados y moderacion. No crea reportes de
-- rescate, reservas, pagos ni solicitudes de adopcion.

BEGIN;

CREATE TABLE IF NOT EXISTS public.eventos_asociacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asociacion_id uuid NOT NULL
    REFERENCES public.asociaciones(id) ON DELETE RESTRICT,
  creado_por_usuario_id uuid NOT NULL
    REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  responsable_operativo_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  tipo text CHECK (tipo IS NULL OR tipo IN (
    'vacunacion',
    'esterilizacion',
    'feria_adopcion',
    'identificacion',
    'acopio',
    'capacitacion',
    'bienestar_animal',
    'otro'
  )),
  categoria_otro text,
  titulo text,
  descripcion text,
  inicia_at timestamptz,
  termina_at timestamptz,
  zona_horaria text,
  lugar_nombre text,
  direccion_publica text,
  municipio text,
  estado_ubicacion text,
  latitud double precision,
  longitud double precision,
  modalidad_acceso text CHECK (
    modalidad_acceso IS NULL OR modalidad_acceso IN (
      'sin_registro', 'registro_externo', 'contacto_institucional'
    )
  ),
  enlace_registro_externo text,
  instrucciones_contacto text,
  especies_objetivo jsonb NOT NULL DEFAULT '[]'::jsonb,
  publico_objetivo text,
  requisitos_asistencia text,
  servicios_detalle text,
  condiciones_excluidas jsonb NOT NULL DEFAULT '[]'::jsonb,
  documentos_requeridos jsonb NOT NULL DEFAULT '[]'::jsonb,
  contacto_institucional_nombre text,
  contacto_institucional_telefono text,
  contacto_institucional_email text,
  es_gratuito boolean,
  costo_centavos integer CHECK (
    costo_centavos IS NULL OR costo_centavos >= 0
  ),
  moneda text NOT NULL DEFAULT 'MXN' CHECK (char_length(moneda) = 3),
  detalle_costos text,
  cupo_total integer CHECK (cupo_total IS NULL OR cupo_total > 0),
  cupo_estado text NOT NULL DEFAULT 'no_aplica' CHECK (
    cupo_estado IN ('no_aplica', 'disponible', 'agotado')
  ),
  responsable_profesional text,
  cedula_profesional text,
  institucion_profesional text,
  datos_profesionales_estado text NOT NULL DEFAULT 'no_aplica' CHECK (
    datos_profesionales_estado IN ('no_aplica', 'declarado', 'verificado')
  ),
  imagen_storage_path text UNIQUE,
  imagen_mime_type text,
  imagen_size_bytes bigint,
  imagen_texto_alternativo text,
  accesibilidad text,
  transporte text,
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN (
    'borrador',
    'publicado',
    'pausado',
    'cancelado',
    'finalizado',
    'archivado',
    'suspendido_admin'
  )),
  version_publica integer NOT NULL DEFAULT 0 CHECK (version_publica >= 0),
  publicado_at timestamptz,
  pausado_at timestamptz,
  cancelado_at timestamptz,
  cancelado_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  motivo_cancelacion_publico text,
  finalizado_at timestamptz,
  archivado_at timestamptz,
  suspendido_at timestamptz,
  suspendido_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  motivo_suspension text,
  idempotency_key text NOT NULL,
  creado_at timestamptz NOT NULL DEFAULT now(),
  actualizada_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eventos_asociacion_contexto_unico UNIQUE (id, asociacion_id),
  CONSTRAINT eventos_asociacion_idempotencia_unica
    UNIQUE (asociacion_id, idempotency_key),
  CONSTRAINT eventos_asociacion_idempotencia_no_vacia CHECK (
    trim(idempotency_key) <> ''
  ),
  CONSTRAINT eventos_asociacion_listas_json CHECK (
    jsonb_typeof(especies_objetivo) = 'array'
    AND jsonb_typeof(condiciones_excluidas) = 'array'
    AND jsonb_typeof(documentos_requeridos) = 'array'
  ),
  CONSTRAINT eventos_asociacion_coordenadas_validas CHECK (
    (latitud IS NULL AND longitud IS NULL)
    OR (
      latitud IS NOT NULL
      AND longitud IS NOT NULL
      AND latitud BETWEEN -90 AND 90
      AND longitud BETWEEN -180 AND 180
    )
  ),
  CONSTRAINT eventos_asociacion_categoria_otro_consistente CHECK (
    tipo IS DISTINCT FROM 'otro'
    OR NULLIF(trim(categoria_otro), '') IS NOT NULL
  ),
  CONSTRAINT eventos_asociacion_fechas_validas CHECK (
    inicia_at IS NULL OR termina_at IS NULL OR inicia_at < termina_at
  ),
  CONSTRAINT eventos_asociacion_cupo_consistente CHECK (
    (cupo_total IS NULL AND cupo_estado = 'no_aplica')
    OR (
      cupo_total IS NOT NULL
      AND cupo_estado IN ('disponible', 'agotado')
    )
  ),
  CONSTRAINT eventos_asociacion_costo_consistente CHECK (
    es_gratuito IS NULL
    OR (es_gratuito = true AND COALESCE(costo_centavos, 0) = 0)
    OR (es_gratuito = false AND costo_centavos IS NOT NULL)
  ),
  CONSTRAINT eventos_asociacion_modalidad_consistente CHECK (
    modalidad_acceso IS NULL
    OR modalidad_acceso = 'sin_registro'
    OR (
      modalidad_acceso = 'registro_externo'
      AND NULLIF(trim(enlace_registro_externo), '') IS NOT NULL
    )
    OR (
      modalidad_acceso = 'contacto_institucional'
      AND NULLIF(trim(instrucciones_contacto), '') IS NOT NULL
    )
  ),
  CONSTRAINT eventos_asociacion_imagen_consistente CHECK (
    (
      imagen_storage_path IS NULL
      AND imagen_mime_type IS NULL
      AND imagen_size_bytes IS NULL
      AND imagen_texto_alternativo IS NULL
    )
    OR (
      imagen_storage_path LIKE 'eventos/%'
      AND imagen_storage_path !~ '(^|/)\.\.(/|$)'
      AND imagen_mime_type IS NOT NULL
      AND imagen_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
      AND imagen_size_bytes IS NOT NULL
      AND imagen_size_bytes > 0
      AND imagen_size_bytes <= 10485760
      AND imagen_texto_alternativo IS NOT NULL
      AND NULLIF(trim(imagen_texto_alternativo), '') IS NOT NULL
    )
  ),
  CONSTRAINT eventos_asociacion_version_publica_consistente CHECK (
    (
      version_publica = 0
      AND publicado_at IS NULL
      AND estado IN ('borrador', 'archivado')
    )
    OR (
      version_publica > 0
      AND publicado_at IS NOT NULL
      AND estado <> 'borrador'
    )
  ),
  CONSTRAINT eventos_asociacion_datos_publicables CHECK (
    estado = 'borrador'
    OR (estado = 'archivado' AND version_publica = 0)
    OR (
      tipo IS NOT NULL
      AND NULLIF(trim(titulo), '') IS NOT NULL
      AND NULLIF(trim(descripcion), '') IS NOT NULL
      AND inicia_at IS NOT NULL
      AND termina_at IS NOT NULL
      AND inicia_at < termina_at
      AND NULLIF(trim(zona_horaria), '') IS NOT NULL
      AND NULLIF(trim(lugar_nombre), '') IS NOT NULL
      AND NULLIF(trim(direccion_publica), '') IS NOT NULL
      AND NULLIF(trim(municipio), '') IS NOT NULL
      AND NULLIF(trim(estado_ubicacion), '') IS NOT NULL
      AND latitud IS NOT NULL
      AND longitud IS NOT NULL
      AND modalidad_acceso IS NOT NULL
      AND jsonb_array_length(especies_objetivo) > 0
      AND NULLIF(trim(publico_objetivo), '') IS NOT NULL
      AND NULLIF(trim(requisitos_asistencia), '') IS NOT NULL
      AND NULLIF(trim(contacto_institucional_nombre), '') IS NOT NULL
      AND (
        NULLIF(trim(contacto_institucional_telefono), '') IS NOT NULL
        OR NULLIF(trim(contacto_institucional_email), '') IS NOT NULL
      )
      AND es_gratuito IS NOT NULL
      AND responsable_operativo_usuario_id IS NOT NULL
    )
  ),
  CONSTRAINT eventos_asociacion_clinico_consistente CHECK (
    estado = 'borrador'
    OR tipo NOT IN ('vacunacion', 'esterilizacion')
    OR (
      NULLIF(trim(responsable_profesional), '') IS NOT NULL
      AND NULLIF(trim(servicios_detalle), '') IS NOT NULL
      AND datos_profesionales_estado IN ('declarado', 'verificado')
    )
  ),
  CONSTRAINT eventos_asociacion_cancelacion_consistente CHECK (
    estado <> 'cancelado'
    OR (
      cancelado_at IS NOT NULL
      AND cancelado_por_usuario_id IS NOT NULL
      AND NULLIF(trim(motivo_cancelacion_publico), '') IS NOT NULL
    )
  ),
  CONSTRAINT eventos_asociacion_finalizacion_consistente CHECK (
    estado <> 'finalizado' OR finalizado_at IS NOT NULL
  ),
  CONSTRAINT eventos_asociacion_archivo_consistente CHECK (
    estado <> 'archivado' OR archivado_at IS NOT NULL
  ),
  CONSTRAINT eventos_asociacion_suspension_consistente CHECK (
    estado <> 'suspendido_admin'
    OR (
      suspendido_at IS NOT NULL
      AND suspendido_por_usuario_id IS NOT NULL
      AND NULLIF(trim(motivo_suspension), '') IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS eventos_asociacion_publicos_fecha_idx
  ON public.eventos_asociacion(inicia_at, termina_at, id)
  WHERE estado = 'publicado';

CREATE INDEX IF NOT EXISTS eventos_asociacion_mapa_idx
  ON public.eventos_asociacion(latitud, longitud)
  WHERE estado = 'publicado';

CREATE INDEX IF NOT EXISTS eventos_asociacion_propios_idx
  ON public.eventos_asociacion(
    asociacion_id, estado, actualizada_at DESC
  );

CREATE TABLE IF NOT EXISTS public.versiones_evento_asociacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL
    REFERENCES public.eventos_asociacion(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  snapshot_publico jsonb NOT NULL,
  campos_modificados jsonb NOT NULL DEFAULT '[]'::jsonb,
  creada_por_usuario_id uuid NOT NULL
    REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  creada_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT versiones_evento_asociacion_version_unica
    UNIQUE (evento_id, version),
  CONSTRAINT versiones_evento_asociacion_snapshot_objeto CHECK (
    jsonb_typeof(snapshot_publico) = 'object'
    AND jsonb_typeof(campos_modificados) = 'array'
  )
);

CREATE TABLE IF NOT EXISTS public.eventos_colaboradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL,
  asociacion_organizadora_id uuid NOT NULL,
  tipo_colaborador text NOT NULL CHECK (
    tipo_colaborador IN ('perfil_apoyo', 'asociacion')
  ),
  perfil_apoyo_id uuid
    REFERENCES public.perfil_apoyo(id) ON DELETE RESTRICT,
  asociacion_colaboradora_id uuid
    REFERENCES public.asociaciones(id) ON DELETE RESTRICT,
  aportacion text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (
    estado IN ('pendiente', 'aceptada', 'rechazada', 'cancelada')
  ),
  invitada_por_usuario_id uuid NOT NULL
    REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  respondida_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  respondida_at timestamptz,
  cancelada_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  cancelada_at timestamptz,
  motivo_cancelacion text,
  idempotency_key text NOT NULL,
  creada_at timestamptz NOT NULL DEFAULT now(),
  actualizada_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eventos_colaboradores_evento_contexto_fkey
    FOREIGN KEY (evento_id, asociacion_organizadora_id)
    REFERENCES public.eventos_asociacion(id, asociacion_id)
    ON DELETE RESTRICT,
  CONSTRAINT eventos_colaboradores_origen_exclusivo CHECK (
    (
      tipo_colaborador = 'perfil_apoyo'
      AND perfil_apoyo_id IS NOT NULL
      AND asociacion_colaboradora_id IS NULL
    )
    OR (
      tipo_colaborador = 'asociacion'
      AND perfil_apoyo_id IS NULL
      AND asociacion_colaboradora_id IS NOT NULL
      AND asociacion_colaboradora_id <> asociacion_organizadora_id
    )
  ),
  CONSTRAINT eventos_colaboradores_textos_no_vacios CHECK (
    trim(aportacion) <> '' AND trim(idempotency_key) <> ''
  ),
  CONSTRAINT eventos_colaboradores_respuesta_consistente CHECK (
    (
      estado = 'pendiente'
      AND respondida_por_usuario_id IS NULL
      AND respondida_at IS NULL
    )
    OR (
      estado IN ('aceptada', 'rechazada')
      AND respondida_por_usuario_id IS NOT NULL
      AND respondida_at IS NOT NULL
    )
    OR estado = 'cancelada'
  ),
  CONSTRAINT eventos_colaboradores_cancelacion_consistente CHECK (
    estado <> 'cancelada'
    OR (
      cancelada_por_usuario_id IS NOT NULL
      AND cancelada_at IS NOT NULL
      AND NULLIF(trim(motivo_cancelacion), '') IS NOT NULL
    )
  ),
  CONSTRAINT eventos_colaboradores_idempotencia_unica
    UNIQUE (asociacion_organizadora_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS evento_colaborador_perfil_apoyo_unico
  ON public.eventos_colaboradores(evento_id, perfil_apoyo_id)
  WHERE perfil_apoyo_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS evento_colaborador_asociacion_unica
  ON public.eventos_colaboradores(evento_id, asociacion_colaboradora_id)
  WHERE asociacion_colaboradora_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS eventos_colaboradores_pendientes_idx
  ON public.eventos_colaboradores(estado, creada_at)
  WHERE estado = 'pendiente';

CREATE TABLE IF NOT EXISTS public.eventos_perfiles_adopcion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL,
  asociacion_organizadora_id uuid NOT NULL,
  perfil_adopcion_id uuid NOT NULL,
  perfil_asociacion_id uuid NOT NULL,
  vinculado_por_usuario_id uuid NOT NULL
    REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  creado_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eventos_perfiles_adopcion_evento_contexto_fkey
    FOREIGN KEY (evento_id, asociacion_organizadora_id)
    REFERENCES public.eventos_asociacion(id, asociacion_id)
    ON DELETE RESTRICT,
  CONSTRAINT eventos_perfiles_adopcion_perfil_contexto_fkey
    FOREIGN KEY (perfil_adopcion_id, perfil_asociacion_id)
    REFERENCES public.perfiles_adopcion(id, asociacion_id)
    ON DELETE RESTRICT,
  CONSTRAINT eventos_perfiles_adopcion_vinculo_unico
    UNIQUE (evento_id, perfil_adopcion_id)
);

CREATE INDEX IF NOT EXISTS eventos_perfiles_adopcion_evento_idx
  ON public.eventos_perfiles_adopcion(evento_id, creado_at);

CREATE TABLE IF NOT EXISTS public.eventos_guardados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL
    REFERENCES public.eventos_asociacion(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL
    REFERENCES public.usuarios(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  creado_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eventos_guardados_usuario_evento_unico
    UNIQUE (evento_id, usuario_id),
  CONSTRAINT eventos_guardados_idempotencia_unica
    UNIQUE (usuario_id, idempotency_key),
  CONSTRAINT eventos_guardados_idempotencia_no_vacia CHECK (
    trim(idempotency_key) <> ''
  )
);

CREATE INDEX IF NOT EXISTS eventos_guardados_usuario_fecha_idx
  ON public.eventos_guardados(usuario_id, creado_at DESC);

CREATE TABLE IF NOT EXISTS public.reportes_evento_asociacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL
    REFERENCES public.eventos_asociacion(id) ON DELETE RESTRICT,
  reportado_por_usuario_id uuid NOT NULL
    REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  motivo text NOT NULL CHECK (motivo IN (
    'informacion_falsa',
    'servicio_riesgoso',
    'ubicacion_incorrecta',
    'cobro_no_informado',
    'otro'
  )),
  descripcion text NOT NULL,
  evidencia_storage_path text UNIQUE,
  evidencia_mime_type text,
  evidencia_size_bytes bigint,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (
    estado IN ('pendiente', 'en_revision', 'requiere_informacion', 'resuelto', 'descartado')
  ),
  revisado_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  revisado_at timestamptz,
  resolucion text,
  resuelto_at timestamptz,
  idempotency_key text NOT NULL,
  creado_at timestamptz NOT NULL DEFAULT now(),
  actualizada_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reportes_evento_asociacion_textos_no_vacios CHECK (
    trim(descripcion) <> '' AND trim(idempotency_key) <> ''
  ),
  CONSTRAINT reportes_evento_asociacion_evidencia_privada CHECK (
    (
      evidencia_storage_path IS NULL
      AND evidencia_mime_type IS NULL
      AND evidencia_size_bytes IS NULL
    )
    OR (
      evidencia_storage_path LIKE 'eventos/reportes/%'
      AND evidencia_storage_path !~ '(^|/)\.\.(/|$)'
      AND evidencia_mime_type IS NOT NULL
      AND evidencia_mime_type IN (
        'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
      )
      AND evidencia_size_bytes IS NOT NULL
      AND evidencia_size_bytes > 0
      AND evidencia_size_bytes <= 10485760
    )
  ),
  CONSTRAINT reportes_evento_asociacion_resolucion_consistente CHECK (
    estado NOT IN ('resuelto', 'descartado')
    OR (
      revisado_por_usuario_id IS NOT NULL
      AND revisado_at IS NOT NULL
      AND resuelto_at IS NOT NULL
      AND NULLIF(trim(resolucion), '') IS NOT NULL
    )
  ),
  CONSTRAINT reportes_evento_asociacion_idempotencia_unica
    UNIQUE (reportado_por_usuario_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS reporte_evento_abierto_usuario_unico
  ON public.reportes_evento_asociacion(evento_id, reportado_por_usuario_id)
  WHERE estado IN ('pendiente', 'en_revision', 'requiere_informacion');

CREATE INDEX IF NOT EXISTS reportes_evento_asociacion_pendientes_idx
  ON public.reportes_evento_asociacion(estado, creado_at)
  WHERE estado IN ('pendiente', 'en_revision', 'requiere_informacion');

CREATE TABLE IF NOT EXISTS public.historial_evento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL
    REFERENCES public.eventos_asociacion(id) ON DELETE RESTRICT,
  asociacion_id uuid NOT NULL
    REFERENCES public.asociaciones(id) ON DELETE RESTRICT,
  colaboracion_id uuid
    REFERENCES public.eventos_colaboradores(id) ON DELETE RESTRICT,
  reporte_evento_id uuid
    REFERENCES public.reportes_evento_asociacion(id) ON DELETE RESTRICT,
  actor_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  tipo_evento text NOT NULL,
  estado_anterior text,
  estado_nuevo text,
  motivo text,
  campos_modificados jsonb NOT NULL DEFAULT '[]'::jsonb,
  datos_extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  version_publica integer,
  idempotency_key text NOT NULL,
  creado_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historial_evento_contexto_fkey
    FOREIGN KEY (evento_id, asociacion_id)
    REFERENCES public.eventos_asociacion(id, asociacion_id)
    ON DELETE RESTRICT,
  CONSTRAINT historial_evento_json_consistente CHECK (
    jsonb_typeof(campos_modificados) = 'array'
    AND jsonb_typeof(datos_extra) = 'object'
  ),
  CONSTRAINT historial_evento_textos_no_vacios CHECK (
    trim(tipo_evento) <> '' AND trim(idempotency_key) <> ''
  ),
  CONSTRAINT historial_evento_idempotencia_unica
    UNIQUE (asociacion_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS historial_evento_evento_fecha_idx
  ON public.historial_evento(evento_id, creado_at DESC);

CREATE OR REPLACE FUNCTION public.bloquear_mutacion_auditoria_evento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION
    'Los registros de auditoria de eventos son inmutables';
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_propiedad_evento_asociacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'Un evento no se elimina; debe cancelarse o archivarse';
  END IF;

  IF NEW.asociacion_id IS DISTINCT FROM OLD.asociacion_id
     OR NEW.creado_por_usuario_id IS DISTINCT FROM OLD.creado_por_usuario_id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.creado_at IS DISTINCT FROM OLD.creado_at THEN
    RAISE EXCEPTION
      'La propiedad y el origen de un evento son inmutables';
  END IF;

  IF NEW.version_publica < OLD.version_publica THEN
    RAISE EXCEPTION
      'La version publica de un evento no puede disminuir';
  END IF;

  IF OLD.publicado_at IS NOT NULL
     AND NEW.publicado_at IS DISTINCT FROM OLD.publicado_at THEN
    RAISE EXCEPTION
      'La fecha de primera publicacion es inmutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_identidad_colaborador_evento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'Una colaboracion no se elimina; debe cancelarse';
  END IF;

  IF NEW.evento_id IS DISTINCT FROM OLD.evento_id
     OR NEW.asociacion_organizadora_id IS DISTINCT FROM OLD.asociacion_organizadora_id
     OR NEW.tipo_colaborador IS DISTINCT FROM OLD.tipo_colaborador
     OR NEW.perfil_apoyo_id IS DISTINCT FROM OLD.perfil_apoyo_id
     OR NEW.asociacion_colaboradora_id IS DISTINCT FROM OLD.asociacion_colaboradora_id
     OR NEW.invitada_por_usuario_id IS DISTINCT FROM OLD.invitada_por_usuario_id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.creada_at IS DISTINCT FROM OLD.creada_at THEN
    RAISE EXCEPTION
      'La identidad de una colaboracion es inmutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_colaborador_evento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_valido boolean;
BEGIN
  IF NEW.estado NOT IN ('pendiente', 'aceptada') THEN
    RETURN NEW;
  END IF;

  IF NEW.tipo_colaborador = 'perfil_apoyo' THEN
    SELECT COALESCE(verificado_admin, false)
    INTO v_valido
    FROM public.perfil_apoyo
    WHERE id = NEW.perfil_apoyo_id;
  ELSE
    SELECT COALESCE(verificado, false) AND COALESCE(activo, false)
    INTO v_valido
    FROM public.asociaciones
    WHERE id = NEW.asociacion_colaboradora_id;
  END IF;

  IF COALESCE(v_valido, false) = false THEN
    RAISE EXCEPTION
      'El colaborador debe estar verificado y activo';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_perfil_vinculado_evento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tipo_evento text;
  v_estado_perfil text;
  v_colaboracion_aceptada boolean;
BEGIN
  SELECT tipo
  INTO v_tipo_evento
  FROM public.eventos_asociacion
  WHERE id = NEW.evento_id;

  IF v_tipo_evento IS DISTINCT FROM 'feria_adopcion' THEN
    RAISE EXCEPTION
      'Solo una feria de adopcion puede vincular perfiles';
  END IF;

  SELECT estado
  INTO v_estado_perfil
  FROM public.perfiles_adopcion
  WHERE id = NEW.perfil_adopcion_id;

  IF v_estado_perfil IS DISTINCT FROM 'publicado' THEN
    RAISE EXCEPTION
      'Solo se pueden vincular perfiles de adopcion publicados';
  END IF;

  IF NEW.perfil_asociacion_id <> NEW.asociacion_organizadora_id THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.eventos_colaboradores
      WHERE evento_id = NEW.evento_id
        AND tipo_colaborador = 'asociacion'
        AND asociacion_colaboradora_id = NEW.perfil_asociacion_id
        AND estado = 'aceptada'
    ) INTO v_colaboracion_aceptada;

    IF COALESCE(v_colaboracion_aceptada, false) = false THEN
      RAISE EXCEPTION
        'La asociacion del perfil no participa en esta feria';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER eventos_asociacion_actualizada_at
BEFORE UPDATE ON public.eventos_asociacion
FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_adopcion();

CREATE TRIGGER eventos_asociacion_propiedad_inmutable
BEFORE UPDATE OR DELETE ON public.eventos_asociacion
FOR EACH ROW EXECUTE FUNCTION public.validar_propiedad_evento_asociacion();

CREATE TRIGGER eventos_colaboradores_actualizada_at
BEFORE UPDATE ON public.eventos_colaboradores
FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_adopcion();

CREATE TRIGGER eventos_colaboradores_identidad_inmutable
BEFORE UPDATE OR DELETE ON public.eventos_colaboradores
FOR EACH ROW EXECUTE FUNCTION public.validar_identidad_colaborador_evento();

CREATE TRIGGER reportes_evento_asociacion_actualizada_at
BEFORE UPDATE ON public.reportes_evento_asociacion
FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_adopcion();

CREATE TRIGGER versiones_evento_asociacion_inmutables
BEFORE UPDATE OR DELETE ON public.versiones_evento_asociacion
FOR EACH ROW EXECUTE FUNCTION public.bloquear_mutacion_auditoria_evento();

CREATE TRIGGER historial_evento_inmutable
BEFORE UPDATE OR DELETE ON public.historial_evento
FOR EACH ROW EXECUTE FUNCTION public.bloquear_mutacion_auditoria_evento();

CREATE TRIGGER eventos_colaboradores_validos
BEFORE INSERT OR UPDATE OF
  tipo_colaborador, perfil_apoyo_id, asociacion_colaboradora_id, estado
ON public.eventos_colaboradores
FOR EACH ROW EXECUTE FUNCTION public.validar_colaborador_evento();

CREATE TRIGGER eventos_perfiles_adopcion_validos
BEFORE INSERT OR UPDATE ON public.eventos_perfiles_adopcion
FOR EACH ROW EXECUTE FUNCTION public.validar_perfil_vinculado_evento();

ALTER TABLE public.eventos_asociacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.versiones_evento_asociacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_perfiles_adopcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_guardados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reportes_evento_asociacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial_evento ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.eventos_asociacion,
  public.versiones_evento_asociacion,
  public.eventos_colaboradores,
  public.eventos_perfiles_adopcion,
  public.eventos_guardados,
  public.reportes_evento_asociacion,
  public.historial_evento
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  public.eventos_asociacion,
  public.versiones_evento_asociacion,
  public.eventos_colaboradores,
  public.eventos_perfiles_adopcion,
  public.eventos_guardados,
  public.reportes_evento_asociacion,
  public.historial_evento
TO service_role;

REVOKE ALL ON FUNCTION
  public.bloquear_mutacion_auditoria_evento(),
  public.validar_propiedad_evento_asociacion(),
  public.validar_identidad_colaborador_evento(),
  public.validar_colaborador_evento(),
  public.validar_perfil_vinculado_evento()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.bloquear_mutacion_auditoria_evento(),
  public.validar_propiedad_evento_asociacion(),
  public.validar_identidad_colaborador_evento(),
  public.validar_colaborador_evento(),
  public.validar_perfil_vinculado_evento()
TO service_role;

COMMENT ON TABLE public.eventos_asociacion IS
  'Eventos publicos independientes de reportes, rescates y reservas.';
COMMENT ON TABLE public.versiones_evento_asociacion IS
  'Snapshots inmutables de cada version publicada de un evento.';
COMMENT ON TABLE public.eventos_guardados IS
  'Suscripciones a cambios; guardar no reserva cupo ni registra asistencia.';
COMMENT ON TABLE public.reportes_evento_asociacion IS
  'Reportes privados para moderar informacion falsa, riesgos o cobros no informados.';

COMMIT;

NOTIFY pgrst, 'reload schema';
