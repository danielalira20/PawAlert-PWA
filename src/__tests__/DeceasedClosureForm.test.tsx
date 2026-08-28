import axios from 'axios';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { DeceasedClosureForm } from '../components/association-dashboard/DeceasedClosureForm';


const mockOnClosed = jest.fn(async () => undefined);
const mockShowToast = jest.fn();

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
jest.mock('axios');
jest.mock('expo-crypto', () => ({ randomUUID: () => 'cierre-formulario-123' }));
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ token: 'token-asociacion' }),
}));
jest.mock('../components/Toast', () => ({
  Toast: () => null,
  useToast: () => ({ toast: null, translateY: {}, showToast: mockShowToast }),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DeceasedClosureForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.post.mockResolvedValue({
      data: { estado_reporte: 'muerto', estado_seguimiento: 'cerrado' },
    });
  });

  it('solo muestra conclusiones respaldadas por las gestiones', async () => {
    const view = await render(
      <DeceasedClosureForm
        reporteId="reporte-1"
        accionesRegistradas={['contacto_oficial_realizado']}
        onCancel={jest.fn()}
        onClosed={mockOnClosed}
      />,
    );

    expect(view.getByText('Contacto realizado')).toBeTruthy();
    expect(view.queryByText('La autoridad atendió')).toBeNull();
    expect(view.queryByText('Retiro reportado')).toBeNull();
  });

  it('envía cierre idempotente con nota documentada', async () => {
    const view = await render(
      <DeceasedClosureForm
        reporteId="reporte-1"
        accionesRegistradas={['autoridad_se_presento']}
        onCancel={jest.fn()}
        onClosed={mockOnClosed}
      />,
    );

    fireEvent.press(view.getByLabelText('Conclusión: La autoridad atendió'));
    fireEvent.changeText(
      view.getByLabelText('Nota de cierre'),
      'La asociación revisó la evidencia y el historial completo.',
    );
    await waitFor(() => {
      expect(view.getByLabelText('Confirmar cierre terminal').props.accessibilityState)
        .toEqual({ disabled: false });
    });
    fireEvent.press(view.getByLabelText('Confirmar cierre terminal'));

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/reports/reporte-1/seguimiento-fallecimiento/cerrar'),
        {
          resultado_final: 'autoridad_atendio',
          idempotency_key: 'cierre-formulario-123',
          nota_cierre: 'La asociación revisó la evidencia y el historial completo.',
        },
        { headers: { Authorization: 'Bearer token-asociacion' } },
      );
    });
    expect(mockOnClosed).toHaveBeenCalledTimes(1);
  });
});
