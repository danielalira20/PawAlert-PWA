export type ReportSubmissionStatus = 'completado' | 'revision' | 'sin_cobertura';

export interface ReportSubmissionResult {
  titulo: string;
  mensaje: string;
  estado: ReportSubmissionStatus;
}

const MENSAJES_REVISION: Record<string, string> = {
  phash_coincidencia:
    'La fotografía coincide con evidencia utilizada en otro reporte.',
  exif_ubicacion_discrepante:
    'La ubicación registrada en la fotografía no coincide con la ubicación indicada.',
  gemini_error_tecnico:
    'No pudimos completar el análisis automático de la evidencia.',
  sin_evidencia_fotografica:
    'No se recibió evidencia fotográfica para validar el caso.',
  trust_score_revision_previa:
    'La cuenta requiere una revisión previa antes de publicar nuevos casos.',
  trust_score_no_disponible:
    'No pudimos comprobar automáticamente la información necesaria para publicar el caso.',
};

export function construirResultadoRevision(motivos: unknown): ReportSubmissionResult {
  const codigos = Array.isArray(motivos)
    ? motivos.filter((motivo): motivo is string => typeof motivo === 'string')
    : [];
  const detalles = [...new Set(codigos)]
    .map((codigo) => MENSAJES_REVISION[codigo])
    .filter(Boolean);
  const explicacion = detalles.length
    ? detalles.join(' ')
    : 'Necesitamos verificar la evidencia antes de publicar el caso.';

  return {
    titulo: 'Reporte recibido y en revisión',
    mensaje: `${explicacion} Un administrador revisará el reporte. Todavía no se ha enviado a una asociación ni se han calculado voluntarios candidatos.`,
    estado: 'revision',
  };
}
