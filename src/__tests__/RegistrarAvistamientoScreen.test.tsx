import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import RegistrarAvistamientoScreen from '../screens/RegistrarAvistamientoScreen';

const mockShowToast = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
jest.mock('axios');
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-router', () => ({
  router: { back: () => mockBack() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ token: 'token-usuario' }),
}));
jest.mock('../components/Toast', () => ({
  Toast: () => null,
  useToast: () => ({ toast: null, translateY: {}, showToast: mockShowToast }),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedLocation = Location as jest.Mocked<typeof Location>;
const mockedPicker = ImagePicker as jest.Mocked<typeof ImagePicker>;

const ANIMALES = JSON.stringify([{ id: 'animal-1', tipo_animal: 'perro', orden: 1 }]);

function permitirGps() {
  mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue({
    status: 'granted',
  } as never);
  mockedLocation.getCurrentPositionAsync.mockResolvedValue({
    coords: { latitude: 19.0001, longitude: -98.0001, accuracy: 12 },
    timestamp: 1756300000000,
  } as never);
}

function elegible(respuesta: Record<string, unknown>) {
  mockedAxios.get.mockResolvedValue({ data: respuesta } as never);
}

describe('RegistrarAvistamientoScreen', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockParams = { reporteId: 'rep-1', animales: ANIMALES };
    permitirGps();
    elegible({ elegible: true, fuente: 'confirmacion_reportante' });
  });

  // ─── GPS ────────────────────────────────────────────────────────────────

  it('bloquea el flujo cuando se deniega el permiso de ubicación', async () => {
    mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'denied',
    } as never);

    const view = await render(<RegistrarAvistamientoScreen />);

    await waitFor(() => {
      expect(view.getByText('Necesitamos tu ubicación')).toBeTruthy();
    });
    expect(view.queryByLabelText('Enviar avistamiento')).toBeNull();
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  // ─── Elegibilidad ───────────────────────────────────────────────────────

  it('muestra la distancia real y oculta el formulario cuando no es elegible', async () => {
    elegible({
      elegible: false,
      distancia_metros: 1320.4,
      radio_metros: 500,
      fuente: 'confirmacion_reportante',
    });

    const view = await render(<RegistrarAvistamientoScreen />);

    await waitFor(() => {
      expect(view.getByText('Estás demasiado lejos del caso')).toBeTruthy();
    });
    expect(view.getByText(/Estás a 1320 m, el límite es 500 m\./)).toBeTruthy();
    expect(view.queryByLabelText('Enviar avistamiento')).toBeNull();
  });

  it('muestra el formulario cuando es elegible y consulta con el GPS capturado', async () => {
    const view = await render(<RegistrarAvistamientoScreen />);

    await waitFor(() => {
      expect(view.getByLabelText('Enviar avistamiento')).toBeTruthy();
    });
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/reports/rep-1/avistamientos/elegible'),
      expect.objectContaining({
        params: { latitud: 19.0001, longitud: -98.0001 },
      }),
    );
  });

  // ─── Envío ──────────────────────────────────────────────────────────────

  it('envía sin foto llamando únicamente a POST /avistamientos', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { estado_validacion: 'pendiente' },
    } as never);

    const view = await render(<RegistrarAvistamientoScreen />);
    await waitFor(() => expect(view.getByLabelText('Enviar avistamiento')).toBeTruthy());

    await fireEvent.press(view.getByLabelText('Movilidad Corrió / se alejó'));
    await fireEvent.changeText(view.getByLabelText('Dirección aproximada'), 'Calle Reforma 12');
    await fireEvent.press(view.getByLabelText('Enviar avistamiento'));

    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledTimes(1));
    const [url, body] = mockedAxios.post.mock.calls[0];
    expect(url).toContain('/reports/rep-1/avistamientos');
    expect(url).not.toContain('/foto');
    expect(body).toMatchObject({
      animal_id: 'animal-1',
      latitud: 19.0001,
      longitud: -98.0001,
      precision_metros: 12,
      movilidad_observada: 'corrio_se_alejo',
      direccion_observada: 'Calle Reforma 12',
      comentario: null,
      evidencia_id: null,
    });
  });

  it('con foto sube primero la evidencia y reusa su id en el avistamiento', async () => {
    mockedPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: true,
    } as never);
    mockedPicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///avistamiento.jpg' }],
    } as never);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { evidencia_id: 'evi-9' } } as never)
      .mockResolvedValueOnce({ data: { estado_validacion: 'validado' } } as never);

    const view = await render(<RegistrarAvistamientoScreen />);
    await waitFor(() => expect(view.getByLabelText('Enviar avistamiento')).toBeTruthy());

    await fireEvent.press(view.getByLabelText('Elegir foto de galería'));
    await waitFor(() => expect(view.getByLabelText('Quitar foto')).toBeTruthy());

    await fireEvent.press(view.getByLabelText('Enviar avistamiento'));

    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledTimes(2));
    expect(mockedAxios.post.mock.calls[0][0]).toContain(
      '/reports/rep-1/avistamientos/foto',
    );
    expect(mockedAxios.post.mock.calls[1][0]).toMatch(/\/reports\/rep-1\/avistamientos$/);
    expect(mockedAxios.post.mock.calls[1][1]).toMatchObject({ evidencia_id: 'evi-9' });
  });

  it('no bloquea el envío si falla la subida de la foto', async () => {
    mockedPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: true,
    } as never);
    mockedPicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///avistamiento.jpg' }],
    } as never);
    mockedAxios.post
      .mockRejectedValueOnce(new Error('red caída'))
      .mockResolvedValueOnce({ data: { estado_validacion: 'pendiente' } } as never);

    const view = await render(<RegistrarAvistamientoScreen />);
    await waitFor(() => expect(view.getByLabelText('Enviar avistamiento')).toBeTruthy());

    await fireEvent.press(view.getByLabelText('Elegir foto de galería'));
    await waitFor(() => expect(view.getByLabelText('Quitar foto')).toBeTruthy());
    await fireEvent.press(view.getByLabelText('Enviar avistamiento'));

    await waitFor(() => expect(view.getByText('Avistamiento enviado')).toBeTruthy());
    expect(mockedAxios.post.mock.calls[1][1]).toMatchObject({ evidencia_id: null });
  });

  // ─── Confirmación diferenciada ──────────────────────────────────────────

  it('confirma como ubicación actualizada cuando el avistamiento se auto-valida', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { estado_validacion: 'validado' },
    } as never);

    const view = await render(<RegistrarAvistamientoScreen />);
    await waitFor(() => expect(view.getByLabelText('Enviar avistamiento')).toBeTruthy());
    await fireEvent.press(view.getByLabelText('Enviar avistamiento'));

    await waitFor(() => expect(view.getByText('¡Ubicación actualizada!')).toBeTruthy());
    expect(
      view.getByText(/La nueva ubicación ya quedó registrada en el caso\./),
    ).toBeTruthy();
    expect(view.queryByText('Avistamiento enviado')).toBeNull();
  });

  it('confirma como pendiente de revisión sin dar por actualizada la ubicación', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { estado_validacion: 'pendiente' },
    } as never);

    const view = await render(<RegistrarAvistamientoScreen />);
    await waitFor(() => expect(view.getByLabelText('Enviar avistamiento')).toBeTruthy());
    await fireEvent.press(view.getByLabelText('Enviar avistamiento'));

    await waitFor(() => expect(view.getByText('Avistamiento enviado')).toBeTruthy());
    expect(
      view.getByText(/La asociación revisará tu avistamiento antes de actualizar/),
    ).toBeTruthy();
    expect(view.queryByText('¡Ubicación actualizada!')).toBeNull();
  });

  // ─── Errores del backend ────────────────────────────────────────────────

  it('muestra el mensaje real del backend cuando el envío falla', async () => {
    mockedAxios.post.mockRejectedValue({
      response: {
        status: 403,
        data: { detail: 'No tienes permiso para registrar un avistamiento en este reporte' },
      },
    } as never);

    const view = await render(<RegistrarAvistamientoScreen />);
    await waitFor(() => expect(view.getByLabelText('Enviar avistamiento')).toBeTruthy());
    await fireEvent.press(view.getByLabelText('Enviar avistamiento'));

    await waitFor(() => {
      expect(
        view.getByText('No tienes permiso para registrar un avistamiento en este reporte'),
      ).toBeTruthy();
    });
  });

  it('falla cerrado y no muestra el formulario si la elegibilidad no se puede consultar', async () => {
    mockedAxios.get.mockRejectedValue({
      response: { status: 404, data: { detail: 'Reporte no encontrado' } },
    } as never);

    const view = await render(<RegistrarAvistamientoScreen />);

    await waitFor(() => expect(view.getByText('Reporte no encontrado')).toBeTruthy());
    expect(view.queryByLabelText('Enviar avistamiento')).toBeNull();
  });
});
