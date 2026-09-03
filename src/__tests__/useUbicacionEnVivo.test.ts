import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { useUbicacionEnVivo } from '../hooks/useUbicacionEnVivo';

describe('useUbicacionEnVivo en web', () => {
  const originalPlatform = Platform.OS;
  const originalGeolocation = navigator.geolocation;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: originalGeolocation,
    });
    jest.restoreAllMocks();
  });

  it('muestra la primera coordenada, inicia seguimiento y lo limpia al desmontar', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    let resolverPrimeraPosicion: PositionCallback | undefined;
    let resolverSeguimiento: PositionCallback | undefined;
    let rechazarSeguimiento: PositionErrorCallback | undefined;
    const clearWatch = jest.fn();
    const getCurrentPosition = jest.fn((success: PositionCallback) => {
      resolverPrimeraPosicion = success;
    });
    const watchPosition = jest.fn((success: PositionCallback, error: PositionErrorCallback) => {
      resolverSeguimiento = success;
      rechazarSeguimiento = error;
      return 27;
    });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition, watchPosition, clearWatch },
    });

    const { result, unmount } = await renderHook(() => useUbicacionEnVivo());
    await act(() => result.current.activar());
    expect(result.current.estado).toBe('solicitando');

    await act(() => resolverPrimeraPosicion?.({
      coords: { latitude: 19.043, longitude: -98.2081, accuracy: 18 } as GeolocationCoordinates,
      timestamp: Date.now(),
    } as GeolocationPosition));

    await waitFor(() => expect(result.current.estado).toBe('activo'));
    expect(result.current.posicion).toEqual({
      latitud: 19.043,
      longitud: -98.2081,
      precisionMetros: 18,
    });
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ timeout: 15_000 }),
    );
    expect(watchPosition).toHaveBeenCalledTimes(1);

    await act(() => resolverSeguimiento?.({
      coords: { latitude: 19.044, longitude: -98.209, accuracy: 12 } as GeolocationCoordinates,
      timestamp: Date.now(),
    } as GeolocationPosition));
    expect(result.current.posicion?.latitud).toBe(19.044);

    await act(() => rechazarSeguimiento?.({
      code: 3,
      message: 'Tiempo agotado',
      PERMISSION_DENIED: 1,
    } as GeolocationPositionError));
    expect(result.current.estado).toBe('activo');
    expect(result.current.desactualizado).toBe(true);

    await unmount();
    expect(clearWatch).toHaveBeenCalledWith(27);
  });

  it('sale de carga y marca permiso denegado', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    let rechazar: PositionErrorCallback | undefined;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: jest.fn((_success: PositionCallback, error: PositionErrorCallback) => {
          rechazar = error;
        }),
        watchPosition: jest.fn(),
        clearWatch: jest.fn(),
      },
    });

    const { result } = await renderHook(() => useUbicacionEnVivo());
    await act(() => result.current.activar());
    await act(() => rechazar?.({ code: 1, message: 'Permiso denegado', PERMISSION_DENIED: 1 } as GeolocationPositionError));

    await waitFor(() => expect(result.current.estado).toBe('denegado'));
    expect(result.current.posicion).toBeNull();
  });
});
