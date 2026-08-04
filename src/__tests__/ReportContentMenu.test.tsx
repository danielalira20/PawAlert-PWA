import { fireEvent, render, waitFor } from '@testing-library/react-native';
import axios from 'axios';
import { router } from 'expo-router';

import { ReportContentMenu } from '../components/reports/ReportContentMenu';
import { useAuth } from '../context/AuthContext';

jest.mock('axios');
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedUseAuth = useAuth as jest.Mock;

type RenderView = Awaited<ReturnType<typeof render>>;

async function abrirFormulario(view: RenderView) {
  await fireEvent.press(view.getByLabelText('Reportar publicación'));
  await fireEvent.press(await view.findByText('Reportar publicación'));
}

async function llegarAConfirmacion(view: RenderView) {
  await abrirFormulario(view);
  await fireEvent.press(await view.findByText('La información parece falsa'));
  await fireEvent.changeText(
    await view.findByPlaceholderText('Escribe detalles que ayuden a revisarlo…'),
    'La fotografía no corresponde al caso.',
  );
  await fireEvent.press(await view.findByText('Continuar'));
}

describe('ReportContentMenu — denuncia comunitaria', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({ token: 'token-prueba', isLoggedIn: true });
  });

  it('solicita iniciar sesión cuando la persona no está autenticada', async () => {
    mockedUseAuth.mockReturnValue({ token: null, isLoggedIn: false });
    const view = await render(<ReportContentMenu reportId="reporte-1" />);

    await abrirFormulario(view);
    expect(await view.findByText('Inicia sesión para reportar')).toBeTruthy();

    await fireEvent.press(view.getByText('Iniciar sesión'));
    expect(router.push).toHaveBeenCalledWith('/login');
  });

  it('envía el motivo, detalle y token del usuario', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { estado_moderacion: 'visible' },
    });
    const view = await render(<ReportContentMenu reportId="reporte-1" />);

    await llegarAConfirmacion(view);
    await fireEvent.press(await view.findByText('Enviar reporte'));

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/reports/reporte-1/denuncias'),
        {
          motivo: 'informacion_falsa',
          detalle: 'La fotografía no corresponde al caso.',
        },
        { headers: { Authorization: 'Bearer token-prueba' } },
      );
    });
    expect(view.getByText('Gracias por avisarnos')).toBeTruthy();
  });

  it('retira el reporte visible después de confirmar la tercera denuncia', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { estado_moderacion: 'en_revision' },
    });
    const onModerated = jest.fn();
    const view = await render(
      <ReportContentMenu reportId="reporte-1" onModerated={onModerated} />,
    );

    await llegarAConfirmacion(view);
    await fireEvent.press(await view.findByText('Enviar reporte'));
    await waitFor(() => expect(view.getByText('Gracias por avisarnos')).toBeTruthy());

    expect(onModerated).not.toHaveBeenCalled();
    await fireEvent.press(view.getByText('Entendido'));
    expect(onModerated).toHaveBeenCalledTimes(1);
  });

  it('informa cuando la persona ya había denunciado el reporte', async () => {
    mockedAxios.post.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { detail: 'Ya reportaste esta publicación' },
      },
    });
    const view = await render(<ReportContentMenu reportId="reporte-1" />);

    await llegarAConfirmacion(view);
    await fireEvent.press(await view.findByText('Enviar reporte'));

    await waitFor(() => {
      expect(view.getByText('Reporte ya recibido')).toBeTruthy();
      expect(view.getByText('Ya reportaste esta publicación')).toBeTruthy();
    });
  });
});
