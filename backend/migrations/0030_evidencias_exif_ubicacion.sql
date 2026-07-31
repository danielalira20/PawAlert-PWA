-- Evidencia fotográfica verificable para hitos de rescate.
-- El original no se publica: foto_url apunta a una copia sanitizada sin EXIF.

BEGIN;

CREATE TABLE IF NOT EXISTS public.reporte_evidencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid NOT NULL REFERENCES public.reportes(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  tipo_hito text,
  foto_url text NOT NULL,
  formato_original text NOT NULL,
  ancho integer NOT NULL CHECK (ancho > 0),
  alto integer NOT NULL CHECK (alto > 0),
  size_bytes_original bigint NOT NULL CHECK (size_bytes_original > 0),
  exif_latitud double precision,
  exif_longitud double precision,
  -- EXIF no incluye zona horaria; conservar la hora local sin inventar UTC.
  exif_captured_at timestamp without time zone,
  gps_declarada_latitud double precision,
  gps_declarada_longitud double precision,
  distancia_exif_declarada_m double precision,
  estado_verificacion text NOT NULL DEFAULT 'subida'
    CHECK (estado_verificacion IN ('subida', 'coincidente', 'discrepancia', 'sin_gps_exif')),
  requiere_revision boolean NOT NULL DEFAULT false,
  vinculada_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reporte_evidencias_reporte_idx
  ON public.reporte_evidencias(reporte_id, created_at DESC);

CREATE INDEX IF NOT EXISTS reporte_evidencias_revision_idx
  ON public.reporte_evidencias(requiere_revision, created_at DESC)
  WHERE requiere_revision = true;

ALTER TABLE public.reporte_evidencias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reporte_evidencias FROM anon, authenticated;
GRANT ALL ON public.reporte_evidencias TO service_role;

COMMENT ON TABLE public.reporte_evidencias IS
  'Evidencias de hitos con EXIF privado y copia pública sanitizada.';
COMMENT ON COLUMN public.reporte_evidencias.requiere_revision IS
  'Verdadero cuando el GPS EXIF difiere del GPS declarado por más del umbral configurado.';

NOTIFY pgrst, 'reload schema';

COMMIT;
