import { fireEvent, render } from '@testing-library/react-native';

import { ReportDetailModal } from '../components/staff-dashboard/ReportDetailModal';
import type { ReporteStaff } from '../types/reportestaff';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), {
  virtual: true,
});

jest.mock('../components/common/AnimalCarousel', () => ({
  AnimalCarousel: 'AnimalCarousel',
}));

const reporte: ReporteStaff = {
  id: 'report-1',
  estado_reporte: 'en_camino',
  confirmacion_voluntario: 'confirmado',
  municipio: 'Puebla',
  colonia: 'Centro',
  calle: '1 Oriente',
  referencia: null,
  latitud: 19.04,
  longitud: -98.2,
  created_at: '2026-09-01T18:00:00.000Z',
  foto_url: null,
  animales: [],
  asociacion: { nombre: 'Patitas', telefono: null },
  tiene_sugerencia_aceptada: false,
  tiene_llegada_veterinaria_registrada: false,
  llegada_zona_registrada: false,
  animal_no_localizado_registrado: false,
  animal_bajo_resguardo_registrado: false,
};

const callbacks = {
  onClose: jest.fn(),
  onEncontre: jest.fn(),
  onSinVida: jest.fn(),
  onLlegadaZona: jest.fn(),
  onNoLocalizado: jest.fn(),
  onBajoResguardo: jest.fn(),
  onRefugio: jest.fn(),
  onVeterinaria: jest.fn(),
};

describe('ReportDetailModal navigation access', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ofrece la ruta confirmada sin reemplazar el hito de llegada', async () => {
    const onOpenNavigation = jest.fn();
    const view = await render(
      <ReportDetailModal
        {...callbacks}
        visible
        reporte={reporte}
        onOpenNavigation={onOpenNavigation}
        puedeRegistrarHitos
        esVoluntarioInterno
      />,
    );

    fireEvent.press(view.getByLabelText('Ver ruta del caso en PawAlert'));

    expect(onOpenNavigation).toHaveBeenCalledTimes(1);
    expect(view.getByText('Llegué a la zona')).toBeTruthy();
  });

  it('no ofrece la ruta mientras la confirmación está pendiente', async () => {
    const view = await render(
      <ReportDetailModal
        {...callbacks}
        visible
        reporte={{ ...reporte, confirmacion_voluntario: 'esperando' }}
        onOpenNavigation={jest.fn()}
        puedeRegistrarHitos
        esVoluntarioInterno
      />,
    );

    expect(view.queryByLabelText('Ver ruta del caso en PawAlert')).toBeNull();
  });
});
