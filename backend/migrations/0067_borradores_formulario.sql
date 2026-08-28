-- Borradores privados para formularios largos con información sensible.
-- El primer consumidor es Capacidades del voluntario.
CREATE TABLE public.borradores_formulario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  formulario text NOT NULL,
  version smallint NOT NULL DEFAULT 1 CHECK (version > 0),
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT borradores_formulario_usuario_formulario_unico
    UNIQUE (usuario_id, formulario),
  CONSTRAINT borradores_formulario_nombre_valido
    CHECK (char_length(formulario) BETWEEN 1 AND 100),
  CONSTRAINT borradores_formulario_datos_objeto
    CHECK (jsonb_typeof(datos) = 'object')
);

CREATE INDEX borradores_formulario_vencimiento_idx
  ON public.borradores_formulario(expires_at);

ALTER TABLE public.borradores_formulario ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.borradores_formulario FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.borradores_formulario TO service_role;

CREATE OR REPLACE FUNCTION public.purgar_borradores_formulario_vencidos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  total_eliminados integer;
BEGIN
  DELETE FROM public.borradores_formulario
  WHERE expires_at <= now();

  GET DIAGNOSTICS total_eliminados = ROW_COUNT;
  RETURN total_eliminados;
END;
$$;

REVOKE ALL ON FUNCTION public.purgar_borradores_formulario_vencidos()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purgar_borradores_formulario_vencidos()
  TO service_role;

COMMENT ON TABLE public.borradores_formulario IS
  'Borradores privados y temporales de formularios autenticados; no representan información operativa confirmada.';
COMMENT ON COLUMN public.borradores_formulario.datos IS
  'Estado versionado del formulario. Puede contener datos personales y solo debe consultarse desde el backend autenticado.';
