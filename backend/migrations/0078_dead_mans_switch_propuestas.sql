-- 0078_dead_mans_switch_propuestas.sql
--
-- Capa 6 (Magui) — Dead Man's Switch para propuestas de cobertura
--
-- Agrega la columna alerta_vencimiento_at a propuestas_asignacion.
-- Python calcula este timestamp como (vence_at - 3 minutos) al crear
-- la propuesta. Un cron de 1 minuto consulta esta ventana y envia un
-- push "propuesta_por_vencer" al voluntario para que no pierda su caso
-- por no darse cuenta del tiempo limite.
--
-- No modifica datos existentes ni altera ninguna restriccion existente.
-- La columna es nullable: propuestas antiguas quedan con NULL y el cron
-- simplemente no las encuentra.

BEGIN;

ALTER TABLE public.propuestas_asignacion
    ADD COLUMN IF NOT EXISTS alerta_vencimiento_at TIMESTAMPTZ;

-- Indice parcial: solo propuestas activas con alerta definida.
-- El cron filtra exactamente estas filas.
CREATE INDEX IF NOT EXISTS propuestas_alerta_vencimiento_idx
    ON public.propuestas_asignacion(alerta_vencimiento_at)
    WHERE estado = 'activa' AND alerta_vencimiento_at IS NOT NULL;

COMMIT;
