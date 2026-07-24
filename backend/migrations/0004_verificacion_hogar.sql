-- Flujo de verificación para postulaciones externas de casa temporal.
--
-- Mantiene separadas:
--   1. la postulación general que recibe la asociación;
--   2. la verificación del hogar;
--   3. cada propuesta de visita hecha a un voluntario verificador.
--
-- La distancia máxima absoluta para una visita es 30 km. Cada voluntario
-- puede declarar un radio menor en capacidades y ese límite también se
-- respeta. Los candidatos a 15 km o menos se consideran preferentes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.verificaciones_hogar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  postulacion_id uuid NOT NULL UNIQUE
    REFERENCES public.postulaciones(id),
  perfil_casa_temporal_id uuid NOT NULL
    REFERENCES public.perfil_casa_temporal(id),
  asociacion_id uuid NOT NULL
    REFERENCES public.asociaciones(id),
  voluntario_postulante_id uuid NOT NULL
    REFERENCES public.voluntarios(id),
  estado character varying NOT NULL DEFAULT 'pendiente_revision'
    CHECK (
      estado IN (
        'pendiente_revision',
        'pendiente_asignacion',
        'visita_propuesta',
        'visita_programada',
        'revision_remota',
        'reagendar',
        'requiere_cambios',
        'aprobada',
        'rechazada'
      )
    ),
  modalidad character varying NOT NULL DEFAULT 'por_definir'
    CHECK (modalidad IN ('por_definir', 'presencial', 'remota')),
  distancia_asociacion_km numeric(8, 2)
    CHECK (distancia_asociacion_km IS NULL OR distancia_asociacion_km >= 0),
  resumen_expediente jsonb NOT NULL DEFAULT '{}'::jsonb,
  analisis_video jsonb,
  estado_coordenadas character varying NOT NULL DEFAULT 'pendiente'
    CHECK (
      estado_coordenadas IN (
        'pendiente',
        'coincide',
        'discrepancia',
        'sin_metadatos'
      )
    ),
  notas_asociacion text,
  motivo_resultado text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  resuelta_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.asignaciones_verificacion_hogar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verificacion_hogar_id uuid NOT NULL
    REFERENCES public.verificaciones_hogar(id),
  verificador_voluntario_id uuid NOT NULL
    REFERENCES public.voluntarios(id),
  distancia_km numeric(8, 2) NOT NULL
    CHECK (distancia_km >= 0 AND distancia_km <= 30),
  tramo_distancia character varying NOT NULL
    CHECK (tramo_distancia IN ('preferente', 'extendido')),
  estado character varying NOT NULL DEFAULT 'propuesta'
    CHECK (
      estado IN (
        'propuesta',
        'aceptada',
        'rechazada',
        'cancelada',
        'completada',
        'expirada'
      )
    ),
  propuesta_at timestamp with time zone NOT NULL DEFAULT now(),
  respondida_at timestamp with time zone,
  visita_programada_at timestamp with time zone,
  check_in_at timestamp with time zone,
  check_out_at timestamp with time zone,
  notas_previas text,
  notas_visita text,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  motivo_rechazo text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verificaciones_hogar_asociacion_estado_idx
  ON public.verificaciones_hogar(asociacion_id, estado);

CREATE INDEX IF NOT EXISTS verificaciones_hogar_postulante_idx
  ON public.verificaciones_hogar(voluntario_postulante_id);

CREATE INDEX IF NOT EXISTS asignaciones_verificacion_verificador_estado_idx
  ON public.asignaciones_verificacion_hogar(
    verificador_voluntario_id,
    estado
  );

-- Solo puede existir una propuesta activa a la vez por verificación.
-- Los intentos rechazados, cancelados o expirados se conservan como historial.
CREATE UNIQUE INDEX IF NOT EXISTS asignaciones_verificacion_activa_idx
  ON public.asignaciones_verificacion_hogar(verificacion_hogar_id)
  WHERE estado IN ('propuesta', 'aceptada');

-- La postulación externa siempre se dirige a la asociación activa y
-- verificada más cercana al hogar, sin imponer un radio de cobertura.
CREATE OR REPLACE FUNCTION public.asociacion_mas_cercana_hogar(
  hogar_lat numeric,
  hogar_lng numeric
)
RETURNS TABLE(
  id uuid,
  nombre character varying,
  distancia_km numeric
)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    a.id,
    a.nombre,
    ROUND((
      ST_DistanceSphere(
        ST_MakePoint(a.longitud::float8, a.latitud::float8),
        ST_MakePoint(hogar_lng::float8, hogar_lat::float8)
      ) / 1000.0
    )::numeric, 2) AS distancia_km
  FROM public.asociaciones a
  WHERE a.activo = true
    AND a.verificado = true
    AND a.latitud IS NOT NULL
    AND a.longitud IS NOT NULL
    AND hogar_lat IS NOT NULL
    AND hogar_lng IS NOT NULL
  ORDER BY distancia_km ASC
  LIMIT 1;
$function$;

-- Candidatos de la asociación para verificar un hogar.
-- Se usa la ubicación base declarada en capacidades y no la ubicación en
-- tiempo real. La distancia es aproximada y solo sirve para proponer la visita.
CREATE OR REPLACE FUNCTION public.candidatos_verificacion_hogar(
  p_verificacion_hogar_id uuid
)
RETURNS TABLE(
  voluntario_id uuid,
  usuario_id uuid,
  nombre text,
  distancia_km numeric,
  tramo_distancia text,
  radio_max_km smallint,
  disponibilidad jsonb,
  canal_contacto character varying
)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    v.id AS voluntario_id,
    u.id AS usuario_id,
    TRIM(
      CONCAT_WS(
        ' ',
        u.nombre,
        u.apellido_paterno,
        u.apellido_materno
      )
    )::text AS nombre,
    ROUND((
      ST_DistanceSphere(
        ST_MakePoint(c.longitud::float8, c.latitud::float8),
        ST_MakePoint(pct.longitud::float8, pct.latitud::float8)
      ) / 1000.0
    )::numeric, 2) AS distancia_km,
    CASE
      WHEN ST_DistanceSphere(
        ST_MakePoint(c.longitud::float8, c.latitud::float8),
        ST_MakePoint(pct.longitud::float8, pct.latitud::float8)
      ) <= 15000 THEN 'preferente'::text
      ELSE 'extendido'::text
    END AS tramo_distancia,
    c.radio_max_km,
    c.disponibilidad,
    c.canal_contacto
  FROM public.verificaciones_hogar vh
  JOIN public.perfil_casa_temporal pct
    ON pct.id = vh.perfil_casa_temporal_id
  JOIN public.voluntarios v
    ON v.asociacion_id = vh.asociacion_id
  JOIN public.usuarios u
    ON u.id = v.usuario_id
  JOIN public.roles r
    ON r.id = u.rol_id
  JOIN public.capacidades c
    ON c.voluntario_id = v.id
  WHERE vh.id = p_verificacion_hogar_id
    AND v.id <> vh.voluntario_postulante_id
    AND v.estado IN ('activo_nivel_1', 'activo_nivel_2')
    AND v.disponible_operativamente = true
    AND r.nombre = 'voluntario_interno'
    AND c.acepto_terminos = true
    AND c.latitud IS NOT NULL
    AND c.longitud IS NOT NULL
    AND c.radio_max_km IS NOT NULL
    AND pct.latitud IS NOT NULL
    AND pct.longitud IS NOT NULL
    AND ST_DistanceSphere(
      ST_MakePoint(c.longitud::float8, c.latitud::float8),
      ST_MakePoint(pct.longitud::float8, pct.latitud::float8)
    ) <= LEAST(c.radio_max_km, 30) * 1000
  ORDER BY distancia_km ASC;
$function$;

COMMIT;
