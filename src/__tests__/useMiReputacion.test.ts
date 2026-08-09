import { renderHook, waitFor } from '@testing-library/react-native';
import axios from 'axios';

import { useMiReputacion } from '../hooks/useMiReputacion';
import { useAuth } from '../context/AuthContext';

jest.mock('axios');
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedUseAuth = useAuth as jest.Mock;

describe('useMiReputacion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({ token: 'token-prueba', isLoggedIn: true });
  });

  it('pide GET /reputacion/me con el header Authorization y filtra el rol pedido', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        roles: [
          {
            rol: 'reportante', saldo_disponible: 70, saldo_reservado: 30,
            saldo_total: 100, restriccion_activa: false, mensaje_restriccion: null,
          },
          {
            rol: 'voluntario_interno', saldo_disponible: 5, saldo_reservado: 0,
            saldo_total: 5, restriccion_activa: false, mensaje_restriccion: null,
          },
        ],
      },
    });

    const { result } = await renderHook(() => useMiReputacion('reportante'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/reputacion/me'),
      { headers: { Authorization: 'Bearer token-prueba' } },
    );
    expect(result.current.saldo?.rol).toBe('reportante');
    expect(result.current.saldo?.saldo_disponible).toBe(70);
  });

  it('si el rol pedido no está en la respuesta, saldo queda null sin error', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        roles: [
          {
            rol: 'reportante', saldo_disponible: 20, saldo_reservado: 0,
            saldo_total: 20, restriccion_activa: false, mensaje_restriccion: null,
          },
        ],
      },
    });

    const { result } = await renderHook(() => useMiReputacion('voluntario_interno'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.saldo).toBeNull();
  });

  it('sin token/isLoggedIn no dispara el fetch', async () => {
    mockedUseAuth.mockReturnValue({ token: null, isLoggedIn: false });

    const { result } = await renderHook(() => useMiReputacion('reportante'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(result.current.saldo).toBeNull();
  });

  it('si axios rechaza, isLoading termina en false y saldo queda null sin propagar el error', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('network error'));

    const { result } = await renderHook(() => useMiReputacion('reportante'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.saldo).toBeNull();
  });
});
