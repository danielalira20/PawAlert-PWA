-- Base de Capa 8 (avistamientos): registro de ubicaciones confirmadas de un
-- animal despues del reporte inicial, con el evento que desbloquea a Urgency
-- (Capa 2) para engancharse a cambios de ubicacion confirmada.
--
-- Entrega A unicamente: tabla base + columna en reportes para la ultima
-- ubicacion confirmada. Fuera de alcance a proposito (Entrega B, prompt
-- aparte): FK de evidencia_id a reporte_evidencias, catalogo de perfiles de
-- movilidad, y cualquier servicio de calculo de zona/radio de busqueda.

BEGIN;

CREATE TABLE public.avistamientos_animal (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reporte_id uuid NOT NULL REFERENCES public.reportes(id),
    animal_id uuid NOT NULL REFERENCES public.animal(id),
    latitud numeric NOT NULL,
    longitud numeric NOT NULL,
    precision_metros numeric,
    observado_at timestamptz NOT NULL,
    registrado_at timestamptz NOT NULL DEFAULT now(),
    fuente varchar NOT NULL
        CHECK (fuente IN (
            'reporte_inicial', 'confirmacion_reportante',
            'voluntario_asignado', 'voluntario_verificado',
            'asociacion', 'administracion'
        )),
    usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
    movilidad_observada varchar
        CHECK (movilidad_observada IS NULL OR movilidad_observada IN (
            'sin_movimiento', 'limitada', 'normal', 'corrio_se_alejo', 'desconocida'
        )),
    direccion_observada varchar,
    comentario text,
    evidencia_id uuid,
    estado_validacion varchar NOT NULL DEFAULT 'pendiente'
        CHECK (estado_validacion IN ('pendiente', 'validado', 'rechazado')),
    nivel_confianza varchar
        CHECK (nivel_confianza IS NULL OR nivel_confianza IN ('alta', 'media', 'baja')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX avistamientos_animal_reporte_idx ON public.avistamientos_animal(reporte_id);
CREATE INDEX avistamientos_animal_animal_idx ON public.avistamientos_animal(animal_id);
CREATE INDEX avistamientos_animal_estado_idx ON public.avistamientos_animal(estado_validacion);

ALTER TABLE public.reportes ADD COLUMN ultima_ubicacion_confirmada_id uuid
    REFERENCES public.avistamientos_animal(id);

ALTER TABLE public.avistamientos_animal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.avistamientos_animal FROM anon, authenticated;
GRANT ALL ON public.avistamientos_animal TO service_role;

COMMENT ON TABLE public.avistamientos_animal IS
  'Ubicaciones confirmadas de un animal despues del reporte inicial (Capa 8). Base para Urgency (Capa 2) via el evento ubicacion_confirmada en historial_reporte.';
COMMENT ON COLUMN public.avistamientos_animal.evidencia_id IS
  'Referencia informativa, sin FK todavia -- se vincula a reporte_evidencias en Entrega B.';
COMMENT ON COLUMN public.reportes.ultima_ubicacion_confirmada_id IS
  'Ultimo avistamiento validado del reporte. NULL hasta la primera confirmacion (Capa 8).';

NOTIFY pgrst, 'reload schema';

COMMIT;
