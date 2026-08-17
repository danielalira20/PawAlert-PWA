import { renderHook, waitFor } from '@testing-library/react-native';
import axios from 'axios';

import { useMisInsignias } from '../hooks/useMisInsignias';
import { useAuth } from '../context/AuthContext';

jest.mock('axios');
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedUseAuth = useAuth as jest.Mock;

describe('useMisInsignias', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({ token: 'token-prueba', isLoggedIn: true });
  });

  it('pide GET /reputacion/me/insignias con params.rol y el header Authorization', async () => {
    const insignias = [
      {
        id: 'ins-1', rol: 'reportante', codigo_insignia: 'vigia_comunitario',
        nivel: 'cobre', progreso: 1,
        obtenido_at: '2026-08-01T00:00:00+00:00', mejorado_at: null,
      },
    ];
    mockedAxios.get.mockResolvedValueOnce({ data: insignias });

    const { result } = await renderHook(() => useMisInsignias('reportante'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/reputacion/me/insignias'),
      { params: { rol: 'reportante' }, headers: { Authorization: 'Bearer token-prueba' } },
    );
    expect(result.current.insignias).toEqual(insignias);
  });

  it('con una respuesta vacía, insignias queda como arreglo vacío sin error', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] });

    const { result } = await renderHook(() => useMisInsignias('voluntario_interno'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.insignias).toEqual([]);
  });

  it('sin token/isLoggedIn no dispara el fetch', async () => {
    mockedUseAuth.mockReturnValue({ token: null, isLoggedIn: false });

    const { result } = await renderHook(() => useMisInsignias('reportante'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(result.current.insignias).toEqual([]);
  });

  it('si axios rechaza, isLoading termina en false y insignias queda en un arreglo vacío sin propagar el error', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('network error'));

    const { result } = await renderHook(() => useMisInsignias('reportante'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.insignias).toEqual([]);
  });
});
