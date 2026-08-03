-- Bandeja administrativa real, avisos a coordinadoras y procesos que
-- respaldan el cierre médico/legal de una custodia.

BEGIN;

CREATE TABLE IF NOT EXISTS public.casos_administrativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid REFERENCES public.reportes(id) ON DELETE CASCADE,
  custodia_id uuid REFERENCES public.custodias_temporales(id) ON DELETE CASCADE,
  solicitud_relevo_id uuid REFERENCES public.solicitudes_relevo(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN (
    'reporte_sin_coordinadora', 'relevo_sin_respuesta', 'cancelacion_en_atencion'
  )),
  prioridad text NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja', 'media', 'alta', 'critica')),
  detalle text,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_revision', 'resuelto')),
  atendido_por_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  resolucion text,
  creado_at timestamptz NOT NULL DEFAULT now(),
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  resuelto_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS caso_admin_reporte_activo
  ON public.casos_administrativos(reporte_id, tipo)
  WHERE reporte_id IS NOT NULL AND estado IN ('pendiente', 'en_revision');
CREATE UNIQUE INDEX IF NOT EXISTS caso_admin_relevo_activo
  ON public.casos_administrativos(solicitud_relevo_id, tipo)
  WHERE solicitud_relevo_id IS NOT NULL AND estado IN ('pendiente', 'en_revision');

CREATE TABLE IF NOT EXISTS public.notificaciones_coordinacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asociacion_id uuid NOT NULL REFERENCES public.asociaciones(id) ON DELETE CASCADE,
  reporte_id uuid REFERENCES public.reportes(id) ON DELETE CASCADE,
  custodia_id uuid REFERENCES public.custodias_temporales(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN (
    'cancelacion_reportante', 'vencimiento_sin_respuesta', 'relevo_escalado',
    'caso_asignado_admin'
  )),
  mensaje text NOT NULL,
  leida boolean NOT NULL DEFAULT false,
  fecha_referencia timestamptz NOT NULL DEFAULT now(),
  creada_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notificaciones_coordinacion_asociacion_idx
  ON public.notificaciones_coordinacion(asociacion_id, leida, creada_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS notificacion_coordinacion_ciclo_unico
  ON public.notificaciones_coordinacion(asociacion_id, custodia_id, tipo, fecha_referencia)
  WHERE custodia_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.procesos_resolucion_custodia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custodia_id uuid NOT NULL REFERENCES public.custodias_temporales(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('ingreso_formal_asociacion', 'adopcion_aprobada')),
  referencia text NOT NULL,
  evidencia_url text,
  revision_medica boolean NOT NULL,
  revision_legal boolean NOT NULL,
  idoneidad_adoptante boolean,
  estado text NOT NULL DEFAULT 'aprobado' CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
  creado_por_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  aprobado_por_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  creado_at timestamptz NOT NULL DEFAULT now(),
  aprobado_at timestamptz,
  UNIQUE (custodia_id, tipo, referencia),
  CHECK (tipo <> 'adopcion_aprobada' OR idoneidad_adoptante IS NOT NULL)
);

COMMIT;
