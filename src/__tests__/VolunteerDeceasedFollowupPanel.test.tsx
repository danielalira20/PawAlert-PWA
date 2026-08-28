import axios from 'axios';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { VolunteerDeceasedFollowupPanel } from '../components/staff-dashboard/VolunteerDeceasedFollowupPanel';


const mockShowToast = jest.fn();

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
jest.mock('axios');
jest.mock('expo-crypto', () => ({ randomUUID: () => 'gestion-voluntario-123' }));
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ token: 'token-voluntario' }),
}));
jest.mock('../components/Toast', () => ({
  Toast: () => null,
  useToast: () => ({ toast: null, translateY: {}, showToast: mockShowToast }),
}));
jest.mock('../components/AppModal', () => ({
  AppModal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (
    visible ? children : null
  ),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

const resumen = {
  id: 'seguimiento-1',
  reporte_id: 'reporte-1',
  estado: 'pendiente_voluntario',
  iniciado_at: '2026-08-26T10:00:00Z',
  reporte: { municipio: 'Puebla', colonia: 'Centro' },
  resultados: [{
    id: 'resultado-1',
    animal_id: 'animal-1',
    estado: 'sin_vida_reportado',
    cantidad_reportada: 1,
  }],
};

const detalle = {
  seguimiento: resumen,
  reporte: {
    id: 'reporte-1',
    municipio: 'Puebla',
    colonia: 'Centro',
    calle: 'Reforma',
    animales: [{
      id: 'animal-1',
      tipo_animal: 'perro',
      condicion: 'grave',
      tamanio: 'mediano',
    }],
  },
  resultados: [{
    id: 'resultado-1',
    animal_id: 'animal-1',
    estado: 'sin_vida_reportado',
    cantidad_reportada: 1,
    puede_esperar_seguro: true,
    riesgo_vial: false,
    riesgo_sanitario: false,
    comentario: 'Se documentó el hallazgo.',
    reportado_at: '2026-08-26T10:00:00Z',
  }],
  acciones_retiro: [],
  contactos_retiro: [{
    id: 'contacto-1',
    nombre_servicio: 'Protección Animal',
    telefono: '2221234567',
    tipo_servicio: 'proteccion_animal',
  }],
};

describe('VolunteerDeceasedFollowupPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.get.mockImplementation(async (url) => {
      if (String(url).endsWith('/seguimientos-fallecimiento/reporte-1')) {
        return { data: detalle } as never;
      }
      return { data: [resumen] } as never;
    });
  });

  it('mantiene visible el seguimiento aunque el reporte ya no esté asignado', async () => {
    const view = await render(<VolunteerDeceasedFollowupPanel />);

    await waitFor(() => {
      expect(view.getByLabelText('Abrir seguimientos de retiro')).toBeTruthy();
    });
    expect(view.getByText('Tienes 1 caso que todavía requiere seguimiento.')).toBeTruthy();
  });

  it('muestra gestión y contactos sin ofrecer acceso a evidencia sensible', async () => {
    const view = await render(<VolunteerDeceasedFollowupPanel />);
    await waitFor(() => {
      expect(view.getByLabelText('Abrir seguimientos de retiro')).toBeTruthy();
    });
    fireEvent.press(view.getByLabelText('Abrir seguimientos de retiro'));
    await waitFor(() => {
      expect(view.getByLabelText('Abrir seguimiento de retiro')).toBeTruthy();
    });
    fireEvent.press(view.getByLabelText('Abrir seguimiento de retiro'));

    await waitFor(() => {
      expect(view.getByText('Seguimiento del retiro')).toBeTruthy();
    });
    expect(view.getByText('Protección Animal')).toBeTruthy();
    expect(view.getByLabelText('Registrar una gestión de retiro')).toBeTruthy();
    expect(view.queryByText('Mostrar evidencia sensible')).toBeNull();
  });

  it('vuelve a consultar la bandeja al cambiar la versión de actualización', async () => {
    const view = await render(<VolunteerDeceasedFollowupPanel refreshKey={0} />);
    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledTimes(1));

    view.rerender(<VolunteerDeceasedFollowupPanel refreshKey={1} />);

    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledTimes(2));
  });
});
