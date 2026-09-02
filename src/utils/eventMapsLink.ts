import { Linking } from "react-native";

// Abre la ubicación de un evento en Google Maps (app o navegador). Si hay
// coordenadas exactas se usan esas; si no, se cae a una búsqueda por texto
// con lo que ya se muestra en pantalla. Nunca mostramos las coordenadas en
// la UI: solo viajan dentro del enlace hacia Maps.

interface UbicacionEvento {
  latitud?: number | null;
  longitud?: number | null;
  direccion?: string | null;
}

function construirConsulta(ubicacion: UbicacionEvento): string | null {
  if (ubicacion.latitud != null && ubicacion.longitud != null) {
    return `${ubicacion.latitud},${ubicacion.longitud}`;
  }
  const direccion = ubicacion.direccion?.trim();
  return direccion ? direccion : null;
}

export function tieneUbicacionMapeable(ubicacion: UbicacionEvento): boolean {
  return construirConsulta(ubicacion) != null;
}

export function abrirUbicacionEnMaps(ubicacion: UbicacionEvento): void {
  const consulta = construirConsulta(ubicacion);
  if (!consulta) return;
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    consulta,
  )}`;
  void Linking.openURL(url).catch(() => undefined);
}
