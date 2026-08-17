-- Notificaciones de puntos/insignias/trust score (Persona 1 - Jass).
--
-- Sigue el patron ya validado dos veces en el proyecto
-- (notificaciones_moderacion, notificaciones_aliado): tabla propia por
-- dominio con usuario_id directo, NO la tabla `notificaciones` generica
-- (esa esta modelada para avisar a una asociacion sobre un reporte,
-- sin usuario_id -- no aplica aqui).
--
-- Mismo nivel de proteccion que las demas tablas de gamificacion: RLS
-- habilitado sin politicas, solo service_role puede leer/escribir.
--
-- Pendiente de ejecutar manualmente en Supabase.

BEGIN;

CREATE TABLE public.notificaciones_reputacion (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
    tipo text NOT NULL,
    mensaje text NOT NULL,
    -- Mismo par tipo_origen/evento_origen_id que ya usa
    -- movimientos_puntos/trust_score_movimientos -- referencia de
    -- contexto para que el frontend pueda enlazar la notificacion al
    -- reporte/insignia/incidente que la origino. Ambos nullable: no
    -- toda notificacion tiene un destino de navegacion claro.
    tipo_origen text,
    evento_origen_id uuid,
    leida boolean NOT NULL DEFAULT false,
    leida_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notificaciones_reputacion_usuario_idx
    ON public.notificaciones_reputacion(usuario_id, created_at DESC);

ALTER TABLE public.notificaciones_reputacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notificaciones_reputacion FROM anon, authenticated;

COMMIT;