import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

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
  const suscripcionRef = useRef<Location.LocationSubscription | null>(null);
  const ultimaActualizacionRef = useRef<number | null>(null);

  const limpiar = useCallback(() => {
    suscripcionRef.current?.remove();
    suscripcionRef.current = null;
    ultimaActualizacionRef.current = null;
  }, []);

  const desactivar = useCallback(() => {
    limpiar();
    setEstado('inactivo');
    setPosicion(null);
    setDesactualizado(false);
  }, [limpiar]);

  const activar = useCallback(() => {
    setEstado((actual) => {
      if (actual === 'solicitando' || actual === 'activo') return actual;
      return 'solicitando';
    });

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setEstado('denegado');
          return;
        }
        suscripcionRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5000,
            distanceInterval: 5,
          },
          (ubicacion) => {
            ultimaActualizacionRef.current = Date.now();
            setDesactualizado(false);
            setPosicion({
              latitud: ubicacion.coords.latitude,
              longitud: ubicacion.coords.longitude,
              precisionMetros: ubicacion.coords.accuracy ?? null,
            });
          },
        );
        setEstado('activo');
      } catch {
        setEstado('error');
      }
    })();
  }, []);

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
  useEffect(() => () => limpiar(), [limpiar]);

  return { estado, posicion, desactualizado, activar, desactivar };
}
