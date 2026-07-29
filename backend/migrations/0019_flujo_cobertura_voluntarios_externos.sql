-- Flujo de cobertura coordinada para voluntarios internos y externos.
--
-- La cobertura es independiente del estado operativo del rescate. Un
-- ofrecimiento expresa interés, pero solo esta función transaccional puede
-- reservar el caso y crear una propuesta.

BEGIN;

ALTER TABLE public.reportes
  ADD COLUMN IF NOT EXISTS estado_cobertura text;

ALTER TABLE public.reportes
  DROP CONSTRAINT IF EXISTS reportes_estado_cobertura_check;

ALTER TABLE public.reportes
  ADD CONSTRAINT reportes_estado_cobertura_check
  CHECK (
    estado_cobertura IS NULL
    OR estado_cobertura IN (
      'abierto',
      'propuesta_enviada',
      'confirmado',
      'en_atencion',
      'finalizado'
    )
  );

UPDATE public.reportes
SET estado_cobertura = CASE
  WHEN estado_reporte::text IN ('cerrado', 'cancelado', 'rescatado')
    THEN 'finalizado'
  WHEN asociacion_asignada_id IS NOT NULL
       AND staff_asignado_id IS NULL
       AND estado_reporte::text = 'asignado'
    THEN 'abierto'
  WHEN staff_asignado_id IS NOT NULL
       AND confirmacion_voluntario = 'esperando'
    THEN 'propuesta_enviada'
  WHEN staff_asignado_id IS NOT NULL
       AND confirmacion_voluntario = 'confirmado'
    THEN 'confirmado'
  ELSE estado_cobertura
END
WHERE estado_cobertura IS NULL;

CREATE TABLE IF NOT EXISTS public.voluntario_ofrecimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid NOT NULL REFERENCES public.reportes(id) ON DELETE CASCADE,
  voluntario_id uuid NOT NULL REFERENCES public.voluntarios(id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'vigente'
    CHECK (estado IN (
      'vigente', 'seleccionado', 'retirado', 'no_seleccionado', 'expirado'
    )),
  compatibilidad numeric(5,2),
  distancia_km numeric(7,2),
  capacidad_disponible integer,
  ofrecido_at timestamptz NOT NULL DEFAULT now(),
  actualizado_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS voluntario_ofrecimientos_vigente_unico
  ON public.voluntario_ofrecimientos(reporte_id, voluntario_id)
  WHERE estado IN ('vigente', 'seleccionado');

CREATE INDEX IF NOT EXISTS voluntario_ofrecimientos_reporte_estado_idx
  ON public.voluntario_ofrecimientos(reporte_id, estado, ofrecido_at);

CREATE TABLE IF NOT EXISTS public.propuestas_asignacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid NOT NULL REFERENCES public.reportes(id) ON DELETE CASCADE,
  voluntario_id uuid REFERENCES public.voluntarios(id) ON DELETE RESTRICT,
  usuario_asignado_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  asociacion_coordinadora_id uuid NOT NULL
    REFERENCES public.asociaciones(id) ON DELETE RESTRICT,
  seleccionada_por_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  origen text NOT NULL CHECK (origen IN (
    'equipo_interno', 'ofrecimiento_externo', 'staff', 'escalamiento_automatico'
  )),
  estado text NOT NULL DEFAULT 'activa'
    CHECK (estado IN (
      'activa', 'confirmada', 'rechazada', 'vencida', 'cancelada'
    )),
  enviada_at timestamptz NOT NULL DEFAULT now(),
  vence_at timestamptz,
  respondida_at timestamptz,
  motivo_respuesta text
);

CREATE UNIQUE INDEX IF NOT EXISTS propuestas_asignacion_activa_por_reporte
  ON public.propuestas_asignacion(reporte_id)
  WHERE estado = 'activa';

CREATE UNIQUE INDEX IF NOT EXISTS asignacion_confirmada_por_reporte
  ON public.propuestas_asignacion(reporte_id)
  WHERE estado = 'confirmada';

CREATE INDEX IF NOT EXISTS propuestas_asignacion_usuario_estado_idx
  ON public.propuestas_asignacion(usuario_asignado_id, estado, enviada_at);

CREATE TABLE IF NOT EXISTS public.custodias_temporales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid NOT NULL UNIQUE REFERENCES public.reportes(id) ON DELETE CASCADE,
  voluntario_id uuid REFERENCES public.voluntarios(id) ON DELETE RESTRICT,
  asociacion_coordinadora_id uuid NOT NULL
    REFERENCES public.asociaciones(id) ON DELETE RESTRICT,
  estado text NOT NULL DEFAULT 'activo'
    CHECK (estado IN (
      'activo', 'extension_pendiente', 'buscando_relevo',
      'traslado_programado', 'transferido', 'finalizado'
    )),
  inicio_at timestamptz NOT NULL DEFAULT now(),
  fecha_limite timestamptz,
  proximo_seguimiento_at timestamptz,
  frecuencia_horas integer,
  finalizada_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.seguimientos_resguardo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custodia_id uuid NOT NULL
    REFERENCES public.custodias_temporales(id) ON DELETE CASCADE,
  creado_por_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  condicion_actual text,
  salud text,
  alimentacion text,
  tratamiento text,
  comportamiento text,
  foto_url text NOT NULL,
  entorno_foto_url text,
  latitud numeric,
  longitud numeric,
  gemini_analisis jsonb,
  estado_validacion text NOT NULL DEFAULT 'pendiente'
    CHECK (estado_validacion IN (
      'pendiente', 'validado', 'aclaracion_solicitada', 'alerta'
    )),
  creado_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.validaciones_seguimiento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seguimiento_id uuid NOT NULL
    REFERENCES public.seguimientos_resguardo(id) ON DELETE CASCADE,
  asociacion_id uuid NOT NULL REFERENCES public.asociaciones(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  decision text NOT NULL CHECK (decision IN (
    'validado', 'aclaracion_solicitada', 'alerta'
  )),
  comentario text,
  creado_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seguimiento_id, asociacion_id)
);

CREATE TABLE IF NOT EXISTS public.solicitudes_relevo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custodia_id uuid NOT NULL
    REFERENCES public.custodias_temporales(id) ON DELETE CASCADE,
  solicitada_por_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  motivo text,
  estado text NOT NULL DEFAULT 'abierta'
    CHECK (estado IN ('abierta', 'reservada', 'resuelta', 'cancelada')),
  solicitada_at timestamptz NOT NULL DEFAULT now(),
  resuelta_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS solicitudes_relevo_abierta_por_custodia
  ON public.solicitudes_relevo(custodia_id)
  WHERE estado IN ('abierta', 'reservada');

CREATE TABLE IF NOT EXISTS public.transferencias_custodia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custodia_id uuid NOT NULL
    REFERENCES public.custodias_temporales(id) ON DELETE CASCADE,
  solicitud_relevo_id uuid
    REFERENCES public.solicitudes_relevo(id) ON DELETE SET NULL,
  asociacion_origen_id uuid NOT NULL REFERENCES public.asociaciones(id),
  asociacion_receptora_id uuid NOT NULL REFERENCES public.asociaciones(id),
  fecha_programada timestamptz,
  confirma_entrega_at timestamptz,
  confirma_recepcion_at timestamptz,
  foto_entrega_url text,
  latitud numeric,
  longitud numeric,
  estado text NOT NULL DEFAULT 'programada'
    CHECK (estado IN ('programada', 'en_curso', 'confirmada', 'cancelada')),
  creada_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS transferencia_activa_por_custodia
  ON public.transferencias_custodia(custodia_id)
  WHERE estado IN ('programada', 'en_curso');

-- Único punto autorizado para reservar cobertura. SELECT FOR UPDATE serializa
-- solicitudes concurrentes; las restricciones parciales son la segunda línea
-- de defensa.
CREATE OR REPLACE FUNCTION public.reservar_cobertura_reporte(
  p_reporte_id uuid,
  p_usuario_asignado_id uuid,
  p_voluntario_id uuid,
  p_asociacion_id uuid,
  p_actor_id uuid,
  p_origen text,
  p_vence_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_reporte public.reportes%ROWTYPE;
  v_propuesta_id uuid;
  v_rol text;
BEGIN
  IF p_origen NOT IN (
    'equipo_interno', 'ofrecimiento_externo', 'staff',
    'escalamiento_automatico'
  ) THEN
    RAISE EXCEPTION 'origen_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_reporte
  FROM public.reportes
  WHERE id = p_reporte_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reporte_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_reporte.asociacion_asignada_id IS DISTINCT FROM p_asociacion_id THEN
    RAISE EXCEPTION 'asociacion_no_coordina' USING ERRCODE = '42501';
  END IF;

  IF v_reporte.estado_reporte::text <> 'asignado'
     OR v_reporte.estado_cobertura IS DISTINCT FROM 'abierto'
     OR v_reporte.staff_asignado_id IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM public.propuestas_asignacion
       WHERE reporte_id = p_reporte_id AND estado = 'activa'
     ) THEN
    RAISE EXCEPTION 'caso_no_disponible' USING ERRCODE = 'P0001';
  END IF;

  IF p_voluntario_id IS NOT NULL THEN
    SELECT r.nombre
    INTO v_rol
    FROM public.voluntarios v
    JOIN public.usuarios u ON u.id = v.usuario_id
    JOIN public.roles r ON r.id = u.rol_id
    WHERE v.id = p_voluntario_id
      AND v.usuario_id = p_usuario_asignado_id
      AND v.estado IN ('activo_nivel_1', 'activo_nivel_2');

    IF v_rol IS NULL THEN
      RAISE EXCEPTION 'voluntario_no_elegible' USING ERRCODE = '22023';
    END IF;

    IF p_origen IN ('equipo_interno', 'escalamiento_automatico')
       AND v_rol <> 'voluntario_interno' THEN
      RAISE EXCEPTION 'externo_fuera_de_top' USING ERRCODE = '42501';
    END IF;

    IF p_origen = 'ofrecimiento_externo' AND (
      v_rol <> 'voluntario_externo'
      OR NOT EXISTS (
        SELECT 1 FROM public.voluntario_ofrecimientos
        WHERE reporte_id = p_reporte_id
          AND voluntario_id = p_voluntario_id
          AND estado = 'vigente'
      )
    ) THEN
      RAISE EXCEPTION 'ofrecimiento_no_vigente' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.propuestas_asignacion (
    reporte_id, voluntario_id, usuario_asignado_id,
    asociacion_coordinadora_id, seleccionada_por_id, origen, vence_at
  ) VALUES (
    p_reporte_id, p_voluntario_id, p_usuario_asignado_id,
    p_asociacion_id, p_actor_id, p_origen, p_vence_at
  )
  RETURNING id INTO v_propuesta_id;

  UPDATE public.reportes
  SET staff_asignado_id = p_usuario_asignado_id,
      confirmacion_voluntario = 'esperando',
      estado_cobertura = 'propuesta_enviada'
  WHERE id = p_reporte_id;

  IF p_origen = 'ofrecimiento_externo' THEN
    UPDATE public.voluntario_ofrecimientos
    SET estado = 'seleccionado', actualizado_at = now()
    WHERE reporte_id = p_reporte_id
      AND voluntario_id = p_voluntario_id
      AND estado = 'vigente';
  END IF;

  INSERT INTO public.historial_reporte (
    reporte_id, usuario_id, tipo_evento, descripcion, datos_extra
  ) VALUES (
    p_reporte_id,
    p_actor_id,
    CASE
      WHEN p_origen = 'ofrecimiento_externo'
        THEN 'ofrecimiento_seleccionado'
      ELSE 'propuesta_asignacion_enviada'
    END,
    'La asociación coordinadora envió una propuesta de atención',
    jsonb_build_object(
      'propuesta_id', v_propuesta_id,
      'voluntario_id', p_voluntario_id,
      'origen', p_origen
    )
  );

  RETURN v_propuesta_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.responder_propuesta_cobertura(
  p_reporte_id uuid,
  p_usuario_id uuid,
  p_acepta boolean,
  p_motivo text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_reporte public.reportes%ROWTYPE;
  v_propuesta public.propuestas_asignacion%ROWTYPE;
BEGIN
  SELECT * INTO v_reporte
  FROM public.reportes
  WHERE id = p_reporte_id
  FOR UPDATE;

  SELECT * INTO v_propuesta
  FROM public.propuestas_asignacion
  WHERE reporte_id = p_reporte_id
    AND usuario_asignado_id = p_usuario_id
    AND estado = 'activa'
  FOR UPDATE;

  IF NOT FOUND
     OR v_reporte.estado_cobertura IS DISTINCT FROM 'propuesta_enviada'
     OR v_reporte.staff_asignado_id IS DISTINCT FROM p_usuario_id THEN
    RAISE EXCEPTION 'propuesta_no_disponible' USING ERRCODE = 'P0001';
  END IF;

  IF p_acepta THEN
    UPDATE public.propuestas_asignacion
    SET estado = 'confirmada', respondida_at = now()
    WHERE id = v_propuesta.id;

    UPDATE public.reportes
    SET confirmacion_voluntario = 'confirmado',
        estado_cobertura = 'confirmado',
        estado_reporte = 'en_camino'
    WHERE id = p_reporte_id;

    UPDATE public.voluntario_ofrecimientos
    SET estado = CASE
          WHEN voluntario_id = v_propuesta.voluntario_id
            THEN 'seleccionado'
          ELSE 'no_seleccionado'
        END,
        actualizado_at = now()
    WHERE reporte_id = p_reporte_id
      AND estado IN ('vigente', 'seleccionado');
  ELSE
    UPDATE public.propuestas_asignacion
    SET estado = 'rechazada',
        respondida_at = now(),
        motivo_respuesta = p_motivo
    WHERE id = v_propuesta.id;

    UPDATE public.reportes
    SET staff_asignado_id = NULL,
        confirmacion_voluntario = NULL,
        estado_cobertura = 'abierto'
    WHERE id = p_reporte_id;

    UPDATE public.voluntario_ofrecimientos
    SET estado = 'vigente', actualizado_at = now()
    WHERE reporte_id = p_reporte_id
      AND voluntario_id = v_propuesta.voluntario_id
      AND estado = 'seleccionado';
  END IF;

  INSERT INTO public.historial_reporte (
    reporte_id, usuario_id, tipo_evento, descripcion, datos_extra
  ) VALUES (
    p_reporte_id,
    p_usuario_id,
    CASE
      WHEN p_acepta AND v_propuesta.origen = 'ofrecimiento_externo'
        THEN 'voluntario_externo_confirma'
      WHEN p_acepta THEN 'voluntario_confirma'
      ELSE 'voluntario_rechaza'
    END,
    CASE
      WHEN p_acepta THEN 'La persona voluntaria confirmó el caso'
      ELSE 'La persona voluntaria rechazó la propuesta'
    END,
    jsonb_build_object('propuesta_id', v_propuesta.id, 'motivo', p_motivo)
  );

  RETURN CASE WHEN p_acepta THEN 'confirmado' ELSE 'abierto' END;
END;
$function$;

-- Estas funciones modifican asignaciones y reciben identificadores internos.
-- Se invocan exclusivamente desde el backend con la service role; nunca deben
-- quedar disponibles para la llave pública del frontend.
REVOKE ALL ON FUNCTION public.reservar_cobertura_reporte(
  uuid, uuid, uuid, uuid, uuid, text, timestamptz
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.responder_propuesta_cobertura(
  uuid, uuid, boolean, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reservar_cobertura_reporte(
  uuid, uuid, uuid, uuid, uuid, text, timestamptz
) TO service_role;

GRANT EXECUTE ON FUNCTION public.responder_propuesta_cobertura(
  uuid, uuid, boolean, text
) TO service_role;

COMMIT;
