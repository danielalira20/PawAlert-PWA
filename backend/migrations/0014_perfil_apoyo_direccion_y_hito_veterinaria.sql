-- Flujo "llego_veterinaria" (Ruta 1, motor de sugerencias) + dirección de
-- perfil_apoyo. El botón "Cómo llegar" sigue usando lat/lng, extraídos aquí
-- de zona_cobertura vía ST_X/ST_Y — no se agregan columnas de coordenadas
-- nuevas, calle/colonia/municipio/referencia son solo para mostrar texto.

ALTER TABLE public.perfil_apoyo ADD COLUMN calle varchar(200);
ALTER TABLE public.perfil_apoyo ADD COLUMN colonia varchar(150);
ALTER TABLE public.perfil_apoyo ADD COLUMN municipio varchar(100);
ALTER TABLE public.perfil_apoyo ADD COLUMN referencia text;

-- Utilidad de lectura reusada en dos lugares: la validación GPS de 200m del
-- hito 'llego_veterinaria' (reports.py, registrar_hito) y la respuesta
-- enriquecida de POST /reports/{id}/hitos/aceptar-sugerencia
-- (aceptar_sugerencia_veterinaria en red_aliados_service.py).
CREATE OR REPLACE FUNCTION public.ubicacion_perfil_apoyo(p_perfil_apoyo_id uuid)
RETURNS TABLE(
  latitud numeric,
  longitud numeric,
  calle varchar,
  colonia varchar,
  municipio varchar,
  referencia text
)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    ST_Y(zona_cobertura::geometry)::numeric AS latitud,
    ST_X(zona_cobertura::geometry)::numeric AS longitud,
    calle,
    colonia,
    municipio,
    referencia
  FROM public.perfil_apoyo
  WHERE id = p_perfil_apoyo_id;
$function$;
