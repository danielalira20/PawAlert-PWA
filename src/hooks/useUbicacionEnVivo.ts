import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

// "Estoy aquí": complemento puramente visual y personal del mapa de "casos
// cerca de mí". Marca dónde está parado el usuario (como el punto azul de
// Google Maps) y el radio de 500 m que ya usa el backend para el registro
// de avistamientos (radio_entrada_avistamiento_metros en
// backend/app/config.py). No se comparte con nadie, no se envía al backend
// ni afecta trust_score/testigo_cercano — vive y muere en este hook.
export const RADIO_METROS_ESTOY_AQUI = 500;

// Si no llega una actualización de GPS en este tiempo (se perdió señal, se
// revocó el permiso, la app pasó a segundo plano), la posición se marca
// como desactualizada en vez de seguir mostrando un punto viejo como si
// fuera la posición actual.
const UMBRAL_INACTIVIDAD_MS = 60_000;
const INTERVALO_CHEQUEO_MS = 5_000;
const TIMEOUT_UBICACION_WEB_MS = 15_000;

export type EstadoUbicacionEnVivo =
  | 'inactivo'
  | 'solicitando'
  | 'activo'
  | 'denegado'
  | 'error';

export interface PosicionEnVivo {
  latitud: number;
  longitud: number;
  precisionMetros: number | null;
}

interface UbicacionEnVivo {
  estado: EstadoUbicacionEnVivo;
  posicion: PosicionEnVivo | null;
  desactualizado: boolean;
  activar: () => void;
  desactivar: () => void;
}

/**
 * Tracking de posición en tiempo real, solo mientras `activar()` esté
 * encendido. Pensado para un toggle explícito en el mapa (no se activa
 * solo al montar el componente), así el permiso de GPS se pide únicamente
 * cuando el usuario lo pide.
 */
export function useUbicacionEnVivo(): UbicacionEnVivo {
  const [estado, setEstado] = useState<EstadoUbicacionEnVivo>('inactivo');
  const [posicion, setPosicion] = useState<PosicionEnVivo | null>(null);
  const [desactualizado, setDesactualizado] = useState(false);
  const detenerSeguimientoRef = useRef<(() => void) | null>(null);
  const ultimaActualizacionRef = useRef<number | null>(null);
  const solicitudRef = useRef(0);

  const limpiar = useCallback(() => {
    detenerSeguimientoRef.current?.();
    detenerSeguimientoRef.current = null;
    ultimaActualizacionRef.current = null;
  }, []);

  const desactivar = useCallback(() => {
    solicitudRef.current += 1;
    limpiar();
    setEstado('inactivo');
    setPosicion(null);
    setDesactualizado(false);
  }, [limpiar]);

  const activar = useCallback(() => {
    if (estado === 'solicitando' || estado === 'activo') return;

    const solicitud = solicitudRef.current + 1;
    solicitudRef.current = solicitud;
    limpiar();
    setPosicion(null);
    setDesactualizado(false);
    setEstado('solicitando');

    const registrarPosicion = (latitud: number, longitud: number, precisionMetros: number | null) => {
      if (solicitudRef.current !== solicitud) return;
      ultimaActualizacionRef.current = Date.now();
      setDesactualizado(false);
      setPosicion({ latitud, longitud, precisionMetros });
      setEstado('activo');
    };

    const registrarErrorInicialWeb = (error: GeolocationPositionError) => {
      if (solicitudRef.current !== solicitud) return;
      limpiar();
      setEstado(error.code === error.PERMISSION_DENIED ? 'denegado' : 'error');
    };

    const registrarErrorSeguimientoWeb = (error: GeolocationPositionError) => {
      if (solicitudRef.current !== solicitud) return;
      if (error.code === error.PERMISSION_DENIED) {
        limpiar();
        setEstado('denegado');
        return;
      }
      // Una lectura ya confirmada sigue siendo útil si el GPS pierde señal
      // momentáneamente; el estilo gris evita presentarla como actual.
      setDesactualizado(true);
    };

    (async () => {
      try {
        // Expo Location consulta primero navigator.permissions en web. Esa API
        // no está disponible de forma uniforme en navegadores móviles y su
        // solicitud de posición no fija timeout, por lo que el spinner puede
        // quedarse para siempre. La API web directa da un resultado acotado y
        // conserva Expo Location para iOS/Android nativos.
        if (Platform.OS === 'web') {
          if (typeof navigator === 'undefined' || !navigator.geolocation) {
            if (solicitudRef.current === solicitud) setEstado('error');
            return;
          }

          navigator.geolocation.getCurrentPosition(
            (ubicacion) => {
              if (solicitudRef.current !== solicitud) return;
              registrarPosicion(
                ubicacion.coords.latitude,
                ubicacion.coords.longitude,
                ubicacion.coords.accuracy ?? null,
              );

              const watchId = navigator.geolocation.watchPosition(
                (actualizacion) => registrarPosicion(
                  actualizacion.coords.latitude,
                  actualizacion.coords.longitude,
                  actualizacion.coords.accuracy ?? null,
                ),
                registrarErrorSeguimientoWeb,
                {
                  enableHighAccuracy: false,
                  maximumAge: 5_000,
                  timeout: TIMEOUT_UBICACION_WEB_MS,
                },
              );
              detenerSeguimientoRef.current = () => navigator.geolocation.clearWatch(watchId);
            },
            registrarErrorInicialWeb,
            {
              enableHighAccuracy: false,
              maximumAge: 0,
              timeout: TIMEOUT_UBICACION_WEB_MS,
            },
          );
          return;
        }

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (solicitudRef.current !== solicitud) return;
        if (status !== 'granted') {
          setEstado('denegado');
          return;
        }

        const inicial = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        registrarPosicion(
          inicial.coords.latitude,
          inicial.coords.longitude,
          inicial.coords.accuracy ?? null,
        );
        if (solicitudRef.current !== solicitud) return;

        const suscripcion = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5000,
            distanceInterval: 5,
          },
          (ubicacion) => {
            registrarPosicion(
              ubicacion.coords.latitude,
              ubicacion.coords.longitude,
              ubicacion.coords.accuracy ?? null,
            );
          },
        );
        if (solicitudRef.current !== solicitud) {
          suscripcion.remove();
          return;
        }
        detenerSeguimientoRef.current = () => suscripcion.remove();
      } catch {
        if (solicitudRef.current === solicitud) {
          limpiar();
          setEstado('error');
        }
      }
    })();
  }, [estado, limpiar]);

  // Vigila inactividad mientras el tracking está activo.
  useEffect(() => {
    if (estado !== 'activo') return;
    const intervalo = setInterval(() => {
      const ultima = ultimaActualizacionRef.current;
      if (ultima && Date.now() - ultima > UMBRAL_INACTIVIDAD_MS) {
        setDesactualizado(true);
      }
    }, INTERVALO_CHEQUEO_MS);
    return () => clearInterval(intervalo);
  }, [estado]);

  // Limpieza al desmontar (p.ej. el usuario sale de la pantalla del mapa).
  useEffect(() => () => {
    solicitudRef.current += 1;
    limpiar();
  }, [limpiar]);

  return { estado, posicion, desactualizado, activar, desactivar };
}
