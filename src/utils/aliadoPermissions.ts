const TIPOS_CON_DISPONIBILIDAD_PROACTIVA = new Set([
  'aliado_local',
  'patrocinador_institucional',
]);

export function puedeOfrecerDisponibilidadAbierta(
  tipoPerfilApoyo: string | null | undefined,
): boolean {
  return Boolean(
    tipoPerfilApoyo && TIPOS_CON_DISPONIBILIDAD_PROACTIVA.has(tipoPerfilApoyo),
  );
}
