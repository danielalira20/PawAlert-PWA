import axios from 'axios';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { DeceasedFollowupPanel } from '../components/association-dashboard/DeceasedFollowupPanel';


const mockShowToast = jest.fn();

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
jest.mock('axios');
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ token: 'token-asociacion' }),
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
  asociacion_deadline_at: '2099-08-27T10:00:00Z',
  administracion_deadline_at: '2099-08-28T10:00:00Z',
  reportes: {
    municipio: 'Puebla',
    colonia: 'Centro',
    created_at: '2026-08-26T08:00:00Z',
  },
};

const detalle = {
  seguimiento: resumen,
  reporte: {
    id: 'reporte-1',
    estado_reporte: 'pendiente_seguimiento_fallecimiento',
    municipio: 'Puebla',
    colonia: 'Centro',
    calle: 'Reforma',
    animales: [{
      id: 'animal-1',
      tipo_animal: 'perro',
      condicion: 'grave',
      tamanio: 'mediano',
      cantidad: 1,
      es_grupo: false,
    }],
  },
  resultados: [{
    id: 'resultado-1',
    animal_id: 'animal-1',
    estado: 'sin_vida_reportado',
    cantidad_reportada: 1,
    latitud: 19.04,
    longitud: -98.2,
    puede_esperar_seguro: true,
    riesgo_vial: false,
    riesgo_sanitario: false,
    comentario: 'Se encontró junto a la banqueta.',
    reportado_at: '2026-08-26T10:00:00Z',
    evidencia: {
      url: 'https://storage.example/evidencia-firmada',
      expira_at: '2099-08-26T10:05:00Z',
      contenido_sensible: true,
    },
  }],
  acciones_retiro: [],
  contactos_retiro: [],
};

function configurarAxios() {
  mockedAxios.get.mockImplementation(async (url) => {
    if (String(url).endsWith('/seguimientos-fallecimiento/reporte-1')) {
      return { data: detalle } as never;
    }
    return { data: [resumen] } as never;
  });
  mockedAxios.post.mockResolvedValue({ data: { estado_resultado: 'sin_vida_confirmado' } });
}

describe('DeceasedFollowupPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configurarAxios();
  });

  it('carga la bandeja de seguimientos de la asociación', async () => {
    const view = await render(<DeceasedFollowupPanel visible />);

    await waitFor(() => {
      expect(view.getByText('Seguimiento en curso')).toBeTruthy();
    });
    expect(view.getByText('Centro, Puebla')).toBeTruthy();
  });

  it('mantiene oculta la evidencia hasta que se solicita verla', async () => {
    const view = await render(<DeceasedFollowupPanel visible />);
    await waitFor(() => {
      expect(view.getByLabelText('Abrir seguimiento sensible')).toBeTruthy();
    });
    fireEvent.press(view.getByLabelText('Abrir seguimiento sensible'));

    await waitFor(() => {
      expect(view.getByText('Revisión de resultado')).toBeTruthy();
    });
    expect(view.queryByText('Ocultar evidencia')).toBeNull();

    fireEvent.press(view.getByLabelText('Mostrar evidencia sensible'));

    await waitFor(() => {
      expect(view.getByText('Ocultar evidencia')).toBeTruthy();
    });
  });

  it('envía una decisión humana con sus notas', async () => {
    const view = await render(<DeceasedFollowupPanel visible />);
    await waitFor(() => {
      expect(view.getByLabelText('Abrir seguimiento sensible')).toBeTruthy();
    });
    fireEvent.press(view.getByLabelText('Abrir seguimiento sensible'));
    await waitFor(() => {
      expect(view.getByText('Revisión de resultado')).toBeTruthy();
    });

    fireEvent.press(view.getByLabelText('Revisar este resultado'));
    await waitFor(() => {
      expect(view.getByText('Confirmar resultado')).toBeTruthy();
    });
    fireEvent.press(view.getByLabelText('Decisión: Confirmar resultado'));
    await waitFor(() => {
      expect(
        view.getByLabelText('Decisión: Confirmar resultado').props.accessibilityState,
      ).toEqual({ selected: true });
    });
    fireEvent.changeText(
      view.getByLabelText('Notas de revisión'),
      'La evidencia y el contexto son consistentes.',
    );
    await waitFor(() => {
      expect(view.getByLabelText('Guardar revisión').props.accessibilityState).toEqual({
        disabled: false,
      });
    });
    fireEvent.press(view.getByLabelText('Guardar revisión'));

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining(
          '/seguimientos-fallecimiento/reporte-1/resultados/resultado-1/revision',
        ),
        {
          decision: 'confirmar',
          notas: 'La evidencia y el contexto son consistentes.',
        },
        { headers: { Authorization: 'Bearer token-asociacion' } },
      );
    });
  });
});
