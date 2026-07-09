export const CONDICION_PREVIEW: Record<string, { color: string; bg: string; label: string }> = {
  estable: { color: '#27AE60', bg: '#EAFAF1', label: 'Estable' },
  herido: { color: '#F39C12', bg: '#FEF9E7', label: 'Herido' },
  grave: { color: '#E74C3C', bg: '#FDEDEC', label: 'Grave' },
};

export function getCondicionPreview(condicion?: string | null) {
  const key = condicion?.toLowerCase() ?? '';
  return CONDICION_PREVIEW[key] ?? { color: '#95A5A6', bg: '#F2F3F4', label: condicion || 'Desconocido' };
}

// NOTA: "asignado" usa el teal de tu tema petzen (petzen.colors.teal), que no
// tengo el hex exacto — aproximé con el verde-azulado de nuestra paleta
// (#66BCB4). Ajusta este valor si tu petzen.colors.teal es distinto.
export const ESTADO_PREVIEW: Record<string, { color: string; label: string }> = {
  pendiente: { color: '#F39C12', label: 'Pendiente' },
  asignado: { color: '#66BCB4', label: 'Asignado' },
  en_camino: { color: '#64748B', label: 'En camino' },
  en_atencion: { color: '#9B59B6', label: 'En atención' },
  cerrado: { color: '#64748B', label: 'Cerrado' },
  rescatado: { color: '#27AE60', label: 'Rescatado' },
};

export function getEstadoPreview(estado?: string | null) {
  return ESTADO_PREVIEW[estado ?? ''] ?? { color: '#64748B', label: estado || '—' };
}