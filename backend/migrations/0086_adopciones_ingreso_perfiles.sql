-- Base privada del modulo de adopciones: propuestas de ingreso, perfiles,
-- fotografias publicables e historial. Esta migracion no publica perfiles,
-- no aprueba solicitudes y no modifica reportes ni custodias.

BEGIN;

-- Permiten garantizar que el animal pertenece al reporte y que la custodia
-- pertenece a la asociacion coordinadora declarada.
CREATE UNIQUE INDEX IF NOT EXISTS animal_id_reporte_id_unico
  ON public.animal(id, reporte_id);

CREATE UNIQUE INDEX IF NOT EXISTS custodia_contexto_adopcion_unico
  ON public.custodias_temporales(
    id, reporte_id, asociacion_coordinadora_id
  );

CREATE TABLE IF NOT EXISTS public.solicitudes_ingreso_adopcion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origen text NOT NULL CHECK (origen IN (
    'custodia_pawalert',
    'ingreso_formal_asociacion'
  )),
  asociacion_id uuid NOT NULL
    REFERENCES public.asociaciones(id) ON DELETE RESTRICT,
  custodia_id uuid,
  reporte_id uuid,
  animal_id uuid,
  origen_individuo smallint,
  propuesto_por_usuario_id uuid NOT NULL
    REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN (
    'pendiente',
    'requiere_informacion',
    'aprobada',
    'rechazada',
    'cancelada',
    'no_elegible'
  )),
  nombre_temporal text,
  fotos_propuesta_paths text[] NOT NULL DEFAULT '{}',
  salud_conocida text NOT NULL,
  tratamientos_conocidos text,
  temperamento_observado text NOT NULL,
  compatibilidad_observada jsonb NOT NULL DEFAULT '{}'::jsonb,
  motivo_propuesta text NOT NULL,
  custodia_disponible_hasta timestamptz,
  informacion_solicitada text,
  informacion_solicitada_at timestamptz,
  informacion_respondida_at timestamptz,
  resuelta_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  resuelta_at timestamptz,
  motivo_resolucion text,
  idempotency_key text NOT NULL,
  creada_at timestamptz NOT NULL DEFAULT now(),
  actualizada_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT solicitudes_ingreso_adopcion_animal_reporte_fkey
    FOREIGN KEY (animal_id, reporte_id)
    REFERENCES public.animal(id, reporte_id) ON DELETE RESTRICT,
  CONSTRAINT solicitudes_ingreso_adopcion_custodia_contexto_fkey
    FOREIGN KEY (custodia_id, reporte_id, asociacion_id)
    REFERENCES public.custodias_temporales(
      id, reporte_id, asociacion_coordinadora_id
    ) ON DELETE RESTRICT,
  CONSTRAINT solicitudes_ingreso_adopcion_origen_consistente CHECK (
    (
      origen = 'custodia_pawalert'
      AND custodia_id IS NOT NULL
      AND reporte_id IS NOT NULL
      AND animal_id IS NOT NULL
      AND origen_individuo IS NOT NULL
    )
    OR
    (
      origen = 'ingreso_formal_asociacion'
      AND custodia_id IS NULL
      AND (
        (
          reporte_id IS NULL
          AND animal_id IS NULL
          AND origen_individuo IS NULL
        )
        OR
        (
          reporte_id IS NOT NULL
          AND animal_id IS NOT NULL
          AND origen_individuo IS NOT NULL
        )
      )
    )
  ),
  CONSTRAINT solicitudes_ingreso_adopcion_individuo_positivo CHECK (
    origen_individuo IS NULL OR origen_individuo > 0
  ),
  CONSTRAINT solicitudes_ingreso_adopcion_textos_no_vacios CHECK (
    trim(salud_conocida) <> ''
    AND trim(temperamento_observado) <> ''
    AND trim(motivo_propuesta) <> ''
    AND trim(idempotency_key) <> ''
    AND (nombre_temporal IS NULL OR trim(nombre_temporal) <> '')
  ),
  CONSTRAINT solicitudes_ingreso_adopcion_fotos_requeridas CHECK (
    cardinality(fotos_propuesta_paths) BETWEEN 1 AND 5
  ),
  CONSTRAINT solicitudes_ingreso_adopcion_compatibilidad_objeto CHECK (
    jsonb_typeof(compatibilidad_observada) = 'object'
  ),
  CONSTRAINT solicitudes_ingreso_adopcion_aclaracion_consistente CHECK (
    estado <> 'requiere_informacion'
    OR (
      NULLIF(trim(informacion_solicitada), '') IS NOT NULL
      AND informacion_solicitada_at IS NOT NULL
    )
  ),
  CONSTRAINT solicitudes_ingreso_adopcion_resolucion_consistente CHECK (
    (
      estado IN ('aprobada', 'rechazada', 'cancelada', 'no_elegible')
      AND resuelta_por_usuario_id IS NOT NULL
      AND resuelta_at IS NOT NULL
      AND NULLIF(trim(motivo_resolucion), '') IS NOT NULL
    )
    OR
    (
      estado IN ('pendiente', 'requiere_informacion')
      AND resuelta_por_usuario_id IS NULL
      AND resuelta_at IS NULL
      AND motivo_resolucion IS NULL
    )
  ),
  CONSTRAINT solicitudes_ingreso_adopcion_idempotencia_unica
    UNIQUE (propuesto_por_usuario_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS solicitud_ingreso_adopcion_abierta_animal
  ON public.solicitudes_ingreso_adopcion(animal_id, origen_individuo)
  WHERE animal_id IS NOT NULL
    AND estado IN ('pendiente', 'requiere_informacion', 'aprobada');

CREATE INDEX IF NOT EXISTS solicitudes_ingreso_adopcion_asociacion_estado_idx
  ON public.solicitudes_ingreso_adopcion(
    asociacion_id, estado, creada_at DESC
  );

CREATE INDEX IF NOT EXISTS solicitudes_ingreso_adopcion_custodia_idx
  ON public.solicitudes_ingreso_adopcion(custodia_id, creada_at DESC)
  WHERE custodia_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.perfiles_adopcion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asociacion_id uuid NOT NULL
    REFERENCES public.asociaciones(id) ON DELETE RESTRICT,
  solicitud_ingreso_id uuid UNIQUE
    REFERENCES public.solicitudes_ingreso_adopcion(id) ON DELETE RESTRICT,
  origen text NOT NULL CHECK (origen IN (
    'custodia_pawalert',
    'ingreso_formal_asociacion'
  )),
  custodia_id uuid,
  reporte_id uuid,
  animal_id uuid,
  origen_individuo smallint,
  creado_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  nombre_publico text,
  tipo_animal_id uuid
    REFERENCES public.tipo_animal_catalogo(id) ON DELETE RESTRICT,
  tipo_animal_otro_id uuid
    REFERENCES public.tipo_animal_otro(id) ON DELETE RESTRICT,
  tamanio_id uuid
    REFERENCES public.tamanio_catalogo(id) ON DELETE RESTRICT,
  raza_id uuid REFERENCES public.raza_catalogo(id) ON DELETE SET NULL,
  sexo text,
  edad_aproximada text,
  descripcion text,
  personalidad text,
  salud_conocida text,
  tratamientos text,
  necesidades_especiales text,
  vacunacion_estado text NOT NULL DEFAULT 'desconocido' CHECK (
    vacunacion_estado IN (
      'desconocido', 'pendiente', 'parcial', 'completo', 'no_aplica'
    )
  ),
  esterilizacion_estado text NOT NULL DEFAULT 'desconocido' CHECK (
    esterilizacion_estado IN (
      'desconocido', 'pendiente', 'completo', 'no_aplica'
    )
  ),
  revision_medica_estado text NOT NULL DEFAULT 'desconocida' CHECK (
    revision_medica_estado IN (
      'desconocida', 'pendiente', 'declarada', 'verificada'
    )
  ),
  compatibilidad jsonb NOT NULL DEFAULT '{}'::jsonb,
  zona_general text,
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN (
    'borrador',
    'publicado',
    'pausado',
    'en_proceso',
    'adoptado',
    'retirado',
    'fallecido'
  )),
  estado_moderacion text NOT NULL DEFAULT 'visible' CHECK (
    estado_moderacion IN ('visible', 'suspendido')
  ),
  moderacion_motivo text,
  moderacion_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  moderacion_at timestamptz,
  publicado_at timestamptz,
  pausado_at timestamptz,
  adoptado_at timestamptz,
  retirado_at timestamptz,
  fallecido_at timestamptz,
  creado_at timestamptz NOT NULL DEFAULT now(),
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT perfiles_adopcion_animal_reporte_fkey
    FOREIGN KEY (animal_id, reporte_id)
    REFERENCES public.animal(id, reporte_id) ON DELETE RESTRICT,
  CONSTRAINT perfiles_adopcion_custodia_contexto_fkey
    FOREIGN KEY (custodia_id, reporte_id, asociacion_id)
    REFERENCES public.custodias_temporales(
      id, reporte_id, asociacion_coordinadora_id
    ) ON DELETE RESTRICT,
  CONSTRAINT perfiles_adopcion_individuo_positivo CHECK (
    origen_individuo IS NULL OR origen_individuo > 0
  ),
  CONSTRAINT perfiles_adopcion_origen_consistente CHECK (
    (
      origen = 'custodia_pawalert'
      AND custodia_id IS NOT NULL
      AND reporte_id IS NOT NULL
      AND animal_id IS NOT NULL
      AND origen_individuo IS NOT NULL
      AND solicitud_ingreso_id IS NOT NULL
    )
    OR
    (
      origen = 'ingreso_formal_asociacion'
      AND custodia_id IS NULL
      AND (
        (
          reporte_id IS NULL
          AND animal_id IS NULL
          AND origen_individuo IS NULL
        )
        OR
        (
          reporte_id IS NOT NULL
          AND animal_id IS NOT NULL
          AND origen_individuo IS NOT NULL
        )
      )
    )
  ),
  CONSTRAINT perfiles_adopcion_nombre_no_vacio CHECK (
    nombre_publico IS NULL OR trim(nombre_publico) <> ''
  ),
  CONSTRAINT perfiles_adopcion_compatibilidad_objeto CHECK (
    jsonb_typeof(compatibilidad) = 'object'
  ),
  CONSTRAINT perfiles_adopcion_moderacion_consistente CHECK (
    (
      estado_moderacion = 'visible'
      AND moderacion_motivo IS NULL
      AND moderacion_por_usuario_id IS NULL
      AND moderacion_at IS NULL
    )
    OR
    (
      estado_moderacion = 'suspendido'
      AND NULLIF(trim(moderacion_motivo), '') IS NOT NULL
      AND moderacion_por_usuario_id IS NOT NULL
      AND moderacion_at IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS perfil_adopcion_activo_por_animal
  ON public.perfiles_adopcion(animal_id, origen_individuo)
  WHERE animal_id IS NOT NULL
    AND estado NOT IN ('adoptado', 'retirado', 'fallecido');

CREATE INDEX IF NOT EXISTS perfiles_adopcion_publicos_idx
  ON public.perfiles_adopcion(publicado_at DESC, id)
  WHERE estado = 'publicado' AND estado_moderacion = 'visible';

CREATE INDEX IF NOT EXISTS perfiles_adopcion_asociacion_estado_idx
  ON public.perfiles_adopcion(
    asociacion_id, estado, actualizado_at DESC
  );

CREATE TABLE IF NOT EXISTS public.fotos_perfil_adopcion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_adopcion_id uuid NOT NULL
    REFERENCES public.perfiles_adopcion(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN (
    'image/jpeg', 'image/png', 'image/webp'
  )),
  size_bytes bigint NOT NULL CHECK (
    size_bytes > 0 AND size_bytes <= 10485760
  ),
  orden smallint NOT NULL DEFAULT 1 CHECK (orden > 0),
  texto_alternativo text,
  aprobada_publicacion boolean NOT NULL DEFAULT false,
  aprobada_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  aprobada_at timestamptz,
  subida_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  creada_at timestamptz NOT NULL DEFAULT now(),
  actualizada_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fotos_perfil_adopcion_orden_unico
    UNIQUE (perfil_adopcion_id, orden),
  CONSTRAINT fotos_perfil_adopcion_path_valido CHECK (
    storage_path LIKE 'adopciones/perfiles/%'
    AND storage_path !~ '(^|/)\.\.(/|$)'
  ),
  CONSTRAINT fotos_perfil_adopcion_aprobacion_consistente CHECK (
    (
      aprobada_publicacion = false
      AND aprobada_por_usuario_id IS NULL
      AND aprobada_at IS NULL
    )
    OR
    (
      aprobada_publicacion = true
      AND aprobada_por_usuario_id IS NOT NULL
      AND aprobada_at IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS fotos_perfil_adopcion_publicables_idx
  ON public.fotos_perfil_adopcion(perfil_adopcion_id, orden)
  WHERE aprobada_publicacion = true;

CREATE TABLE IF NOT EXISTS public.historial_adopcion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asociacion_id uuid NOT NULL
    REFERENCES public.asociaciones(id) ON DELETE RESTRICT,
  solicitud_ingreso_id uuid
    REFERENCES public.solicitudes_ingreso_adopcion(id) ON DELETE RESTRICT,
  perfil_adopcion_id uuid
    REFERENCES public.perfiles_adopcion(id) ON DELETE RESTRICT,
  actor_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  tipo_evento text NOT NULL,
  estado_anterior text,
  estado_nuevo text,
  motivo text,
  datos_extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  creado_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historial_adopcion_entidad_requerida CHECK (
    solicitud_ingreso_id IS NOT NULL OR perfil_adopcion_id IS NOT NULL
  ),
  CONSTRAINT historial_adopcion_evento_no_vacio CHECK (
    trim(tipo_evento) <> '' AND trim(idempotency_key) <> ''
  ),
  CONSTRAINT historial_adopcion_idempotencia_unica
    UNIQUE (asociacion_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS historial_adopcion_solicitud_fecha_idx
  ON public.historial_adopcion(solicitud_ingreso_id, creado_at DESC)
  WHERE solicitud_ingreso_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS historial_adopcion_perfil_fecha_idx
  ON public.historial_adopcion(perfil_adopcion_id, creado_at DESC)
  WHERE perfil_adopcion_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.actualizar_timestamp_adopcion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.actualizada_at := now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER solicitudes_ingreso_adopcion_actualizada_at
BEFORE UPDATE ON public.solicitudes_ingreso_adopcion
FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_adopcion();

CREATE TRIGGER perfiles_adopcion_actualizado_at
BEFORE UPDATE ON public.perfiles_adopcion
FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_adopcion();

CREATE TRIGGER fotos_perfil_adopcion_actualizada_at
BEFORE UPDATE ON public.fotos_perfil_adopcion
FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp_adopcion();

CREATE OR REPLACE FUNCTION public.bloquear_mutacion_historial_adopcion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  RAISE EXCEPTION 'historial_adopcion_inmutable' USING ERRCODE = 'P0001';
END;
$function$;

CREATE TRIGGER historial_adopcion_inmutable
BEFORE UPDATE OR DELETE ON public.historial_adopcion
FOR EACH ROW EXECUTE FUNCTION public.bloquear_mutacion_historial_adopcion();

ALTER TABLE public.solicitudes_ingreso_adopcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfiles_adopcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fotos_perfil_adopcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial_adopcion ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.solicitudes_ingreso_adopcion,
  public.perfiles_adopcion,
  public.fotos_perfil_adopcion,
  public.historial_adopcion
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  public.solicitudes_ingreso_adopcion,
  public.perfiles_adopcion,
  public.fotos_perfil_adopcion,
  public.historial_adopcion
TO service_role;

REVOKE ALL ON FUNCTION public.actualizar_timestamp_adopcion()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bloquear_mutacion_historial_adopcion()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_timestamp_adopcion()
TO service_role;
GRANT EXECUTE ON FUNCTION public.bloquear_mutacion_historial_adopcion()
TO service_role;

INSERT INTO storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
VALUES (
  'pawalert-adopciones-privado',
  'pawalert-adopciones-privado',
  false,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMENT ON TABLE public.solicitudes_ingreso_adopcion IS
  'Propuestas privadas para que una asociacion valore el ingreso de un animal al modulo de adopciones.';
COMMENT ON TABLE public.perfiles_adopcion IS
  'Perfil individual coordinado por una asociacion; su estado no modifica reportes ni custodias.';
COMMENT ON TABLE public.fotos_perfil_adopcion IS
  'Fotografias seleccionadas para un perfil; solo las aprobadas se exponen mediante el backend.';
COMMENT ON TABLE public.historial_adopcion IS
  'Auditoria inmutable de propuestas y perfiles de adopcion.';
COMMENT ON COLUMN public.solicitudes_ingreso_adopcion.origen_individuo IS
  'Indice 1..animal.cantidad que individualiza integrantes de una ficha grupal; se valida en la operacion atomica.';
COMMENT ON COLUMN public.perfiles_adopcion.estado_moderacion IS
  'Moderacion separada del ciclo de adopcion para ocultar sin cancelar selecciones o entregas.';

COMMIT;

NOTIFY pgrst, 'reload schema';
