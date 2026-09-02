import type { ReporteStaff } from '../types/reportestaff';

const NAVIGABLE_REPORT_STATES = new Set(['en_camino', 'en_atencion']);

export function canOpenCaseNavigation(
  reporte: Pick<ReporteStaff, 'estado_reporte' | 'confirmacion_voluntario'>,
  puedeRegistrarHitos: boolean,
): boolean {
  return (
    puedeRegistrarHitos &&
    reporte.confirmacion_voluntario === 'confirmado' &&
    NAVIGABLE_REPORT_STATES.has(reporte.estado_reporte)
  );
}
