import axios from 'axios';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { AvistamientosPendientesPanel } from '../components/association-dashboard/AvistamientosPendientesPanel';

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

const mockedAxios = axios as jest.Mocked<typeof axios>;

// El primer render profundo de este panel paga el warm-up del renderer de RN
// y se pasa de los 5 s por defecto cuando la suite corre junto a las demás.
jest.setTimeout(20000);

function avistamiento(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    animal_id: 'animal-1',
    animal: { orden: 1, tipo_animal: 'perro' },
    latitud: 19.0032,
    longitud: -98.2459,
    precision_metros: null,
    observado_at: '2026-08-27T20:00:00+00:00',
    registrado_at: '2026-08-27T20:05:00+00:00',
    fuente: 'confirmacion_reportante',
    movilidad_observada: 'limitada',
    direccion_observada: null,
    comentario: null,
    evidencia_id: null,
    foto_url: null,
    registrado_por: 'Marco Alvarado',
    ...extra,
  };
}

const GRUPO_SIMPLE = {
  reporte_id: 'rep-simple-0001',
  reporte: {
    estado_reporte: 'asignado',
    municipio: 'Puebla',
    colonia: 'Centro',
    calle: 'Reforma',
    created_at: '2026-08-27T10:00:00+00:00',
  },
  en_conflicto: false,
  avistamientos: [avistamiento('av-solo')],
};

const GRUPO_CONFLICTO = {
  reporte_id: 'rep-conflicto-0001',
  reporte: {
    estado_reporte: 'asignado',
    municipio: 'Puebla',
    colonia: null,
    calle: 'Boulevard Municipio Libre',
    created_at: '2026-07-20T07:38:00+00:00',
  },
  en_conflicto: true,
  avistamientos: [
    avistamiento('av-nuevo', { observado_at: '2026-08-28T00:42:00+00:00' }),
    avistamiento('av-medio', { observado_at: '2026-08-27T20:00:00+00:00' }),
    avistamiento('av-viejo', { observado_at: '2026-08-27T14:00:00+00:00' }),
  ],
};

function responder(grupos: unknown[]) {
  mockedAxios.get.mockResolvedValue({ data: grupos } as never);
}

describe('AvistamientosPendientesPanel', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    responder([]);
  });

  it('no renderiza nada cuando el tab no está visible', async () => {
    const view = await render(<AvistamientosPendientesPanel visible={false} />);

    expect(view.queryByLabelText('Actualizar avistamientos')).toBeNull();
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('muestra un mensaje claro cuando no hay pendientes', async () => {
    const view = await render(<AvistamientosPendientesPanel visible />);

    await waitFor(() => {
      expect(view.getByText('No hay avistamientos por validar')).toBeTruthy();
    });
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/associations/me/avistamientos-pendientes'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer token-asociacion' },
      }),
    );
  });

  it('renderiza tarjeta simple para un reporte con un solo pendiente', async () => {
    responder([GRUPO_SIMPLE]);

    const view = await render(<AvistamientosPendientesPanel visible />);

    await waitFor(() => {
      expect(view.getByLabelText('Aprobar avistamiento av-solo')).toBeTruthy();
    });
    expect(view.getByLabelText('Rechazar avistamiento av-solo')).toBeTruthy();
    expect(view.getByText('1 avistamiento por validar')).toBeTruthy();
    expect(view.getByText('Caso REP-SIMP')).toBeTruthy();
    // sin conflicto no se ofrece "Elegir este" ni el aviso comparativo
    expect(view.queryByLabelText('Elegir este avistamiento av-solo')).toBeNull();
  });

  it('renderiza vista comparativa para un reporte con 2+ pendientes', async () => {
    responder([GRUPO_CONFLICTO]);

    const view = await render(<AvistamientosPendientesPanel visible />);

    await waitFor(() => {
      expect(view.getByLabelText('Elegir este avistamiento av-nuevo')).toBeTruthy();
    });
    expect(view.getByLabelText('Elegir este avistamiento av-medio')).toBeTruthy();
    expect(view.getByLabelText('Elegir este avistamiento av-viejo')).toBeTruthy();
    expect(
      view.getByText(/3 reportes distintos de dónde está/),
    ).toBeTruthy();
    expect(view.getByText('Más reciente')).toBeTruthy();
    // en conflicto no se usa el botón "Aprobar" de la tarjeta simple
    expect(view.queryByLabelText('Aprobar avistamiento av-nuevo')).toBeNull();
  });

  it('muestra a la vez el caso simple y el caso en conflicto', async () => {
    responder([GRUPO_SIMPLE, GRUPO_CONFLICTO]);

    const view = await render(<AvistamientosPendientesPanel visible />);

    await waitFor(() => {
      expect(view.getByText('4 avistamientos por validar')).toBeTruthy();
    });
    expect(view.getByLabelText('Aprobar avistamiento av-solo')).toBeTruthy();
    expect(view.getByLabelText('Elegir este avistamiento av-nuevo')).toBeTruthy();
  });

  it('aprobar en tarjeta simple llama a validar con aprobar true', async () => {
    responder([GRUPO_SIMPLE]);
    mockedAxios.post.mockResolvedValue({ data: {} } as never);

    const view = await render(<AvistamientosPendientesPanel visible />);
    await waitFor(() =>
      expect(view.getByLabelText('Aprobar avistamiento av-solo')).toBeTruthy(),
    );

    await fireEvent.press(view.getByLabelText('Aprobar avistamiento av-solo'));

    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledTimes(1));
    const [url, body] = mockedAxios.post.mock.calls[0];
    expect(url).toContain('/reports/rep-simple-0001/avistamientos/av-solo/validar');
    expect(body).toEqual({ aprobar: true });
  });

  it('rechazar llama al mismo endpoint con aprobar false', async () => {
    responder([GRUPO_SIMPLE]);
    mockedAxios.post.mockResolvedValue({ data: {} } as never);

    const view = await render(<AvistamientosPendientesPanel visible />);
    await waitFor(() =>
      expect(view.getByLabelText('Rechazar avistamiento av-solo')).toBeTruthy(),
    );

    await fireEvent.press(view.getByLabelText('Rechazar avistamiento av-solo'));

    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledTimes(1));
    const [url, body] = mockedAxios.post.mock.calls[0];
    expect(url).toContain('/reports/rep-simple-0001/avistamientos/av-solo/validar');
    expect(body).toEqual({ aprobar: false });
  });

  it('"Elegir este" usa el id del avistamiento elegido, no el de los otros', async () => {
    responder([GRUPO_CONFLICTO]);
    mockedAxios.post.mockResolvedValue({ data: {} } as never);

    const view = await render(<AvistamientosPendientesPanel visible />);
    await waitFor(() =>
      expect(view.getByLabelText('Elegir este avistamiento av-medio')).toBeTruthy(),
    );

    await fireEvent.press(view.getByLabelText('Elegir este avistamiento av-medio'));

    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledTimes(1));
    const [url, body] = mockedAxios.post.mock.calls[0];
    expect(url).toContain(
      '/reports/rep-conflicto-0001/avistamientos/av-medio/validar',
    );
    expect(url).not.toContain('av-nuevo');
    expect(url).not.toContain('av-viejo');
    expect(body).toEqual({ aprobar: true });
  });

  it('recarga la bandeja tras resolver (el backend descarta los demás)', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ data: [GRUPO_CONFLICTO] } as never)
      .mockResolvedValueOnce({ data: [] } as never);
    mockedAxios.post.mockResolvedValue({ data: {} } as never);

    const view = await render(<AvistamientosPendientesPanel visible />);
    await waitFor(() =>
      expect(view.getByLabelText('Elegir este avistamiento av-nuevo')).toBeTruthy(),
    );

    await fireEvent.press(view.getByLabelText('Elegir este avistamiento av-nuevo'));

    await waitFor(() =>
      expect(view.getByText('No hay avistamientos por validar')).toBeTruthy(),
    );
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });

  it('muestra el mensaje real del backend si la decisión falla', async () => {
    responder([GRUPO_SIMPLE]);
    mockedAxios.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { detail: 'Este avistamiento ya fue resuelto' } },
    } as never);
    (mockedAxios.isAxiosError as unknown as jest.Mock) = jest.fn(() => true);

    const view = await render(<AvistamientosPendientesPanel visible />);
    await waitFor(() =>
      expect(view.getByLabelText('Aprobar avistamiento av-solo')).toBeTruthy(),
    );

    await fireEvent.press(view.getByLabelText('Aprobar avistamiento av-solo'));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: 'Este avistamiento ya fue resuelto',
        }),
      ),
    );
  });
});
