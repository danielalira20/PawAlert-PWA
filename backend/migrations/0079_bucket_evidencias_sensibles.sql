-- Las evidencias de resultados sensibles no deben compartir el bucket
-- público usado por las fotografías ordinarias de reportes e hitos.

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES (
  'pawalert-evidencias-privadas',
  'pawalert-evidencias-privadas',
  false
)
ON CONFLICT (id) DO UPDATE
SET public = false;

COMMIT;
