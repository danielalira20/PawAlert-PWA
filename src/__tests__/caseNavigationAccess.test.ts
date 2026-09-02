import { canOpenCaseNavigation } from '../utils/caseNavigationAccess';

describe('canOpenCaseNavigation', () => {
  it.each(['en_camino', 'en_atencion'])(
    'permite navegar un caso confirmado en estado %s',
    (estado_reporte) => {
      expect(
        canOpenCaseNavigation(
          {
            estado_reporte,
            confirmacion_voluntario: 'confirmado',
            navegacion_disponible: true,
          },
          true,
        ),
      ).toBe(true);
    },
  );

  it.each<[
    string,
    'esperando' | 'confirmado' | 'rechazado' | null,
  ]>([
    ['asignado', 'confirmado'],
    ['rescatado', 'confirmado'],
    ['cancelado_por_reportante', 'confirmado'],
    ['en_camino', 'esperando'],
    ['en_atencion', 'rechazado'],
    ['en_camino', null],
  ])(
    'oculta la navegación para estado %s y confirmación %s',
    (estado_reporte, confirmacion_voluntario) => {
      expect(canOpenCaseNavigation({
        estado_reporte,
        confirmacion_voluntario,
        navegacion_disponible: true,
      }, true)).toBe(false);
    },
  );

  it('respeta el permiso del rol aunque el caso esté confirmado', () => {
    expect(
      canOpenCaseNavigation(
        {
          estado_reporte: 'en_camino',
          confirmacion_voluntario: 'confirmado',
          navegacion_disponible: true,
        },
        false,
      ),
    ).toBe(false);
  });

  it('oculta navegación para asignaciones heredadas sin propuesta confirmada', () => {
    expect(
      canOpenCaseNavigation(
        {
          estado_reporte: 'en_atencion',
          confirmacion_voluntario: 'confirmado',
          navegacion_disponible: false,
        },
        true,
      ),
    ).toBe(false);
  });
});
