-- Ejes de participación de una asociación: rescates y/o adopciones.
--
-- Hasta ahora toda asociación verificada participaba automáticamente en
-- ambos ejes del sistema (coordinar reportes de rescate y publicar
-- animales en adopción). Esta migración agrega el control para que cada
-- asociación pueda elegir en cuál(es) participa -- útil para la que ya
-- está a tope de capacidad de rescate pero quiere seguir dando
-- visibilidad a sus animales en adopción, o viceversa.
--
-- Defaults conservan el comportamiento actual: participa_rescates y
-- participa_adopciones nacen en true, así que ninguna asociación existente
-- ve un cambio hasta que decida apagar alguno desde su panel.
--
-- Se bloquea a nivel de base de datos (no solo en la API) que una
-- asociación quede con los dos ejes apagados a la vez -- decisión
-- confirmada con el equipo: no tiene sentido una asociación "fantasma"
-- que no participa en nada, y una regla en la BD es la última línea de
-- defensa aunque la validación de la API falle o se le olvide a alguien.

BEGIN;

ALTER TABLE public.asociaciones
  ADD COLUMN IF NOT EXISTS participa_rescates boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS participa_adopciones boolean NOT NULL DEFAULT true;

ALTER TABLE public.asociaciones
  DROP CONSTRAINT IF EXISTS asociaciones_al_menos_un_eje_check,
  ADD CONSTRAINT asociaciones_al_menos_un_eje_check CHECK (
    participa_rescates OR participa_adopciones
  );

COMMENT ON COLUMN public.asociaciones.participa_rescates IS
  'Si es false, la asociación no recibe reportes nuevos vía encontrar_asociacion_operativa (no afecta casos ya asignados).';
COMMENT ON COLUMN public.asociaciones.participa_adopciones IS
  'Si es false, la asociación no puede crear ni gestionar perfiles/solicitudes de adopción nuevos (los perfiles ya publicados siguen visibles).';

NOTIFY pgrst, 'reload schema';

COMMIT;
