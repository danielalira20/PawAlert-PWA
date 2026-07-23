-- Capacidades operativas v2.
--
-- Migración aditiva: conserva temporalmente las columnas del formulario
-- anterior para permitir un despliegue gradual de backend, frontend y
-- matching. No elimina ni reinterpreta datos de casa temporal.

BEGIN;

ALTER TABLE public.voluntarios
  ADD COLUMN IF NOT EXISTS disponible_operativamente boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_nombre character varying(120),
  ADD COLUMN IF NOT EXISTS contacto_emergencia_telefono character varying(20);

ALTER TABLE public.capacidades
  ADD COLUMN IF NOT EXISTS tiempo_reaccion character varying,
  ADD COLUMN IF NOT EXISTS disponibilidad_urgencias character varying,
  ADD COLUMN IF NOT EXISTS max_casos_simultaneos smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS radio_max_km smallint,
  ADD COLUMN IF NOT EXISTS medios_transporte text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS vehiculo_apto_traslado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tamanios_traslado text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS especies_manejo text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS otras_especies_manejo text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS tamanios_manejo text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS primeros_auxilios_nivel character varying,
  ADD COLUMN IF NOT EXISTS experiencias_campo text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS vias_tratamiento text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS trayectoria_tipos text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS experiencia_anios character varying,
  ADD COLUMN IF NOT EXISTS equipamiento text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS restricciones_fisicas text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS acepta_capacitacion character varying,
  ADD COLUMN IF NOT EXISTS canal_contacto character varying,
  ADD COLUMN IF NOT EXISTS compromiso_comunicacion boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS compromiso_notificar boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proyeccion_colaboracion character varying,
  ADD COLUMN IF NOT EXISTS motivaciones text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS comentarios_adicionales character varying(250);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capacidades_tiempo_reaccion_check'
  ) THEN
    ALTER TABLE public.capacidades
      ADD CONSTRAINT capacidades_tiempo_reaccion_check
      CHECK (
        tiempo_reaccion IS NULL
        OR tiempo_reaccion IN ('inmediata', 'una_hora', 'tres_horas', 'un_dia')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capacidades_disponibilidad_urgencias_check'
  ) THEN
    ALTER TABLE public.capacidades
      ADD CONSTRAINT capacidades_disponibilidad_urgencias_check
      CHECK (
        disponibilidad_urgencias IS NULL
        OR disponibilidad_urgencias IN ('si', 'ocasional', 'no')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capacidades_max_casos_simultaneos_check'
  ) THEN
    ALTER TABLE public.capacidades
      ADD CONSTRAINT capacidades_max_casos_simultaneos_check
      CHECK (max_casos_simultaneos BETWEEN 1 AND 3);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capacidades_radio_max_km_check'
  ) THEN
    ALTER TABLE public.capacidades
      ADD CONSTRAINT capacidades_radio_max_km_check
      CHECK (radio_max_km IS NULL OR radio_max_km IN (5, 10, 20, 30));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capacidades_medios_transporte_check'
  ) THEN
    ALTER TABLE public.capacidades
      ADD CONSTRAINT capacidades_medios_transporte_check
      CHECK (
        medios_transporte <@ ARRAY[
          'automovil', 'motocicleta', 'transporte_publico',
          'bicicleta', 'a_pie', 'depende_terceros'
        ]::text[]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capacidades_tamanios_traslado_check'
  ) THEN
    ALTER TABLE public.capacidades
      ADD CONSTRAINT capacidades_tamanios_traslado_check
      CHECK (
        tamanios_traslado <@ ARRAY['pequeno', 'mediano', 'grande']::text[]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capacidades_especies_manejo_check'
  ) THEN
    ALTER TABLE public.capacidades
      ADD CONSTRAINT capacidades_especies_manejo_check
      CHECK (especies_manejo <@ ARRAY['perro', 'gato', 'otro']::text[]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capacidades_otras_especies_manejo_check'
  ) THEN
    ALTER TABLE public.capacidades
      ADD CONSTRAINT capacidades_otras_especies_manejo_check
      CHECK (
        otras_especies_manejo <@ ARRAY[
          'aves', 'pequenos_mamiferos', 'reptiles', 'granja', 'otra'
        ]::text[]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capacidades_tamanios_manejo_check'
  ) THEN
    ALTER TABLE public.capacidades
      ADD CONSTRAINT capacidades_tamanios_manejo_check
      CHECK (
        tamanios_manejo <@ ARRAY['pequeno', 'mediano', 'grande']::text[]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capacidades_primeros_auxilios_check'
  ) THEN
    ALTER TABLE public.capacidades
      ADD CONSTRAINT capacidades_primeros_auxilios_check
      CHECK (
        primeros_auxilios_nivel IS NULL
        OR primeros_auxilios_nivel IN ('sin_formacion', 'basico', 'formal')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capacidades_experiencias_campo_check'
  ) THEN
    ALTER TABLE public.capacidades
      ADD CONSTRAINT capacidades_experiencias_campo_check
      CHECK (
        experiencias_campo <@ ARRAY[
          'docil_estable', 'cachorros_neonatos', 'enfermedad_cuarentena',
          'reactivo_agresivo', 'lesion_movilidad_reducida'
        ]::text[]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capacidades_vias_tratamiento_check'
  ) THEN
    ALTER TABLE public.capacidades
      ADD CONSTRAINT capacidades_vias_tratamiento_check
      CHECK (
        vias_tratamiento <@ ARRAY[
          'oral', 'topica', 'inyectable_avanzado'
        ]::text[]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capacidades_trayectoria_tipos_check'
  ) THEN
    ALTER TABLE public.capacidades
      ADD CONSTRAINT capacidades_trayectoria_tipos_check
      CHECK (
        trayectoria_tipos <@ ARRAY[
          'mascotas_propias', 'rescate_independiente', 'casa_temporal',
          'refugio_asociacion', 'clinica_veterinaria', 'sin_experiencia'
        ]::text[]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capacidades_experiencia_anios_check'
  ) THEN
    ALTER TABLE public.capacidades
      ADD CONSTRAINT capacidades_experiencia_anios_check
      CHECK (
        experiencia_anios IS NULL
        OR experiencia_anios IN (
          'sin_experiencia', 'menos_1', 'entre_1_3', 'mas_3'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capacidades_equipamiento_check'
  ) THEN
    ALTER TABLE public.capacidades
      ADD CONSTRAINT capacidades_equipamiento_check
      CHECK (
        equipamiento <@ ARRAY[
          'transportadora_chica', 'transportadora_grande', 'jaula_contencion',
          'correas_arneses', 'proteccion_vehiculo', 'guantes_manejo',
          'sin_equipo'
        ]::text[]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capacidades_restricciones_fisicas_check'
  ) THEN
    ALTER TABLE public.capacidades
      ADD CONSTRAINT capacidades_restricciones_fisicas_check
      CHECK (
        restricciones_fisicas <@ ARRAY[
          'ninguna', 'evitar_carga_mayor_5kg', 'evitar_carga_mayor_15kg',
          'evitar_escaleras', 'evitar_caminatas_prolongadas',
          'evitar_pie_prolongado', 'prefiere_comentarlo'
        ]::text[]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capacidades_acepta_capacitacion_check'
  ) THEN
    ALTER TABLE public.capacidades
      ADD CONSTRAINT capacidades_acepta_capacitacion_check
      CHECK (
        acepta_capacitacion IS NULL
        OR acepta_capacitacion IN ('si', 'solo_virtual', 'no')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capacidades_canal_contacto_check'
  ) THEN
    ALTER TABLE public.capacidades
      ADD CONSTRAINT capacidades_canal_contacto_check
      CHECK (
        canal_contacto IS NULL
        OR canal_contacto IN ('whatsapp', 'llamada', 'plataforma')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capacidades_proyeccion_colaboracion_check'
  ) THEN
    ALTER TABLE public.capacidades
      ADD CONSTRAINT capacidades_proyeccion_colaboracion_check
      CHECK (
        proyeccion_colaboracion IS NULL
        OR proyeccion_colaboracion IN (
          'ocasional', 'uno_tres_meses', 'tres_seis_meses',
          'mas_seis_meses', 'continua'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capacidades_motivaciones_check'
  ) THEN
    ALTER TABLE public.capacidades
      ADD CONSTRAINT capacidades_motivaciones_check
      CHECK (
        motivaciones <@ ARRAY[
          'salvar_animales', 'apoyar_colectivos', 'aplicar_conocimientos',
          'adquirir_experiencia', 'impacto_social', 'apoyar_recuperacion'
        ]::text[]
      );
  END IF;
END $$;

COMMENT ON COLUMN public.capacidades.disponibilidad IS
  'JSON v2: {"dias":["lun"],"franjas":["matutino"]}. Durante la transición también admite horarios legado.';
COMMENT ON COLUMN public.capacidades.radio_max_km IS
  'Radio máximo elegido por el voluntario. Valores permitidos: 5, 10, 20 o 30 km.';
COMMENT ON COLUMN public.capacidades.primeros_auxilios_nivel IS
  'Nivel autodeclarado; no representa una certificación verificada.';
COMMENT ON COLUMN public.capacidades.vias_tratamiento IS
  'Habilidades autodeclaradas; no representan una certificación verificada.';
COMMENT ON COLUMN public.voluntarios.disponible_operativamente IS
  'Interruptor manual. Cuando es false, el voluntario no debe participar en matching.';

COMMIT;
