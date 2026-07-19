-- Respaldo/documentación versionada de las funciones SQL de matching.
-- Viven ÚNICAMENTE en la base de datos de Supabase — este archivo NO se
-- ejecuta automáticamente al desplegar, es solo código de referencia para
-- poder revisar/recuperar la lógica sin depender del dashboard.
-- Última actualización: tras la Fase 7 de multi-animal (feature/multi-animal).

CREATE OR REPLACE FUNCTION public.candidatos_para_reporte(p_reporte_id uuid)
 RETURNS TABLE(voluntario_id uuid, usuario_id uuid, nombre text, rol text, distancia_km numeric, especies text[], tamanios text[], disponibilidad jsonb, capacidad_animales integer, carga_actual bigint, ofrece_casa_hogar boolean)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    v.id, u.id,
    TRIM(u.nombre || ' ' || u.apellido_paterno)::text,
    r.nombre::text,
    ROUND((ST_DistanceSphere(
      ST_MakePoint(c.longitud::float8, c.latitud::float8),
      ST_MakePoint(rep.longitud::float8, rep.latitud::float8)
    ) / 1000.0)::numeric, 2) AS distancia_km,
    c.especies, c.tamanios, c.disponibilidad, c.capacidad_animales,
    COALESCE((
      SELECT SUM(a.cantidad) FROM reportes rc
      JOIN animal a ON a.reporte_id = rc.id
      WHERE rc.staff_asignado_id = u.id
        AND rc.estado_reporte::text IN ('asignado','en_camino','en_atencion')
    ), 0) AS carga_actual,
    c.ofrece_casa_hogar
  FROM voluntarios v
  JOIN usuarios u    ON u.id = v.usuario_id
  JOIN roles r       ON r.id = u.rol_id
  JOIN capacidades c ON c.voluntario_id = v.id
  JOIN reportes rep  ON rep.id = p_reporte_id
  WHERE v.estado IN ('activo_nivel_1','activo_nivel_2')
    AND c.acepto_terminos = true
    AND c.latitud IS NOT NULL AND c.longitud IS NOT NULL
    AND rep.latitud IS NOT NULL AND rep.longitud IS NOT NULL
    AND (
      (r.nombre = 'voluntario_interno' AND v.asociacion_id = rep.asociacion_asignada_id)
      OR r.nombre = 'voluntario_externo'
    )
    AND ST_DistanceSphere(
      ST_MakePoint(c.longitud::float8, c.latitud::float8),
      ST_MakePoint(rep.longitud::float8, rep.latitud::float8)
    ) <= 10000
$function$;

CREATE OR REPLACE FUNCTION public.encontrar_asociacion_cercana(reporte_lat numeric, reporte_lng numeric, excluir_ids uuid[] DEFAULT '{}'::uuid[], p_tipos_animales text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, nombre character varying, distancia_km numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        a.id,
        a.nombre,
        ( 6371 * acos( cos( radians(reporte_lat) ) * cos( radians( a.latitud ) ) * cos( radians( a.longitud ) - radians(reporte_lng) ) + sin( radians(reporte_lat) ) * sin( radians( a.latitud ) ) ) )::numeric AS distancia_km
    FROM public.asociaciones a
    WHERE
        a.activo = true
        AND a.verificado = true
        AND NOT (a.id = ANY(excluir_ids))
        AND (p_tipos_animales IS NULL OR p_tipos_animales <@ a.tipos_animales::text[])
        AND ( 6371 * acos( cos( radians(reporte_lat) ) * cos( radians( a.latitud ) ) * cos( radians( a.longitud ) - radians(reporte_lng) ) + sin( radians(reporte_lat) ) * sin( radians( a.latitud ) ) ) ) <= a.radio_km
    ORDER BY distancia_km ASC
    LIMIT 1;
END;
$function$;
