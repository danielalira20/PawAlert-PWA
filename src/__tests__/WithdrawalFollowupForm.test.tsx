import axios from 'axios';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { WithdrawalFollowupForm } from '../components/association-dashboard/WithdrawalFollowupForm';


const mockShowToast = jest.fn();
const mockOnSaved = jest.fn(async () => undefined);

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
jest.mock('axios');
jest.mock('expo-crypto', () => ({ randomUUID: () => 'gestion-reintento-123' }));
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ token: 'token-asociacion' }),
}));
jest.mock('../components/Toast', () => ({
  Toast: () => null,
  useToast: () => ({ toast: null, translateY: {}, showToast: mockShowToast }),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WithdrawalFollowupForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.post.mockResolvedValue({ data: { seguimiento_retiro_id: 'gestion-1' } });
  });

  it('conserva datos y clave idempotente al reintentar la gestión', async () => {
    mockedAxios.post
      .mockRejectedValueOnce(new Error('sin conexión'))
      .mockResolvedValueOnce({ data: { seguimiento_retiro_id: 'gestion-1' } });
    const view = await render(
      <WithdrawalFollowupForm
        reporteId="reporte-1"
        resultadoId="resultado-1"
        onCancel={jest.fn()}
        onSaved={mockOnSaved}
      />,
    );

    fireEvent.press(view.getByLabelText('Gestión: Contactamos a un servicio'));
    fireEvent.changeText(view.getByLabelText('Servicio o institución'), ' Protección Animal ');
    fireEvent.changeText(view.getByLabelText('Folio de atención'), ' PA-2026-01 ');
    fireEvent.changeText(view.getByLabelText('Notas de la gestión'), ' Se recibió respuesta. ');

    await waitFor(() => {
      expect(view.getByLabelText('Guardar gestión de retiro').props.accessibilityState)
        .toEqual({ disabled: false });
    });
    fireEvent.press(view.getByLabelText('Guardar gestión de retiro'));

    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledTimes(1));
    expect(mockOnSaved).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(view.getByLabelText('Guardar gestión de retiro').props.accessibilityState)
        .toEqual({ disabled: false });
    });

    fireEvent.press(view.getByLabelText('Guardar gestión de retiro'));
    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('/reports/reporte-1/resultados/resultado-1/seguimiento-retiro'),
        {
          accion: 'contacto_oficial_realizado',
          idempotency_key: 'gestion-reintento-123',
          folio: 'PA-2026-01',
          nombre_servicio: 'Protección Animal',
          destino_informado: null,
          nota: 'Se recibió respuesta.',
          evidencia_lugar_id: null,
        },
        { headers: { Authorization: 'Bearer token-asociacion' } },
      );
    });

    const primerCuerpo = mockedAxios.post.mock.calls[0][1] as Record<string, unknown>;
    const segundoCuerpo = mockedAxios.post.mock.calls[1][1] as Record<string, unknown>;
    const primeraClave = primerCuerpo.idempotency_key;
    const segundaClave = segundoCuerpo.idempotency_key;
    expect(primeraClave).toBe('gestion-reintento-123');
    expect(segundaClave).toBe(primeraClave);
    expect(mockOnSaved).toHaveBeenCalledTimes(1);
  });
});
