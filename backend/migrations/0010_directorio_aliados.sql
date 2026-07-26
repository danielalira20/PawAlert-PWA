-- FRONT17: Directorio, mapa de aliados y mural "Huellas que ayudan".
--
-- perfil_apoyo.zona_cobertura es geography(Point), no columnas planas de
-- latitud/longitud como asociaciones/capacidades — PostgREST no expone
-- ST_X/ST_Y en un select normal, así que se necesita una función RPC que
-- ya entregue las coordenadas extraídas.

BEGIN;

CREATE OR REPLACE FUNCTION public.directorio_aliados()
 RETURNS TABLE(
   id uuid,
   tipo varchar,
   categorias text[],
   verificado_admin boolean,
   aliado_verificado_por uuid,
   preferencia_visibilidad varchar,
   datos_extra jsonb,
   latitud double precision,
   longitud double precision,
   nombre text,
   apellido_paterno text
 )
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    p.id, p.tipo, p.categorias, p.verificado_admin, p.aliado_verificado_por,
    p.preferencia_visibilidad, p.datos_extra,
    ST_Y(p.zona_cobertura::geometry) AS latitud,
    ST_X(p.zona_cobertura::geometry) AS longitud,
    u.nombre, u.apellido_paterno
  FROM perfil_apoyo p
  JOIN usuarios u ON u.id = p.usuario_id
  WHERE p.verificado_admin = true;
$function$;

COMMIT;
