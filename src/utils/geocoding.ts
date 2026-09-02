import axios from 'axios';

// Geocodificación desde el cliente vía Nominatim (OpenStreetMap), el mismo
// servicio que usa el formulario de reportes. Se llama directo desde el front
// para no depender del backend; los fallos nunca deben bloquear el formulario.

export interface ResultadoGeocodificacion {
  latitud: number;
  longitud: number;
  nombreCompleto: string;
  calle?: string;
  colonia?: string;
  municipio?: string;
  estado?: string;
}

const URL_BUSQUEDA = 'https://nominatim.openstreetmap.org/search';
const URL_INVERSA = 'https://nominatim.openstreetmap.org/reverse';

function mapearResultado(item: any): ResultadoGeocodificacion {
  const dir = item?.address ?? {};
  return {
    latitud: parseFloat(item.lat),
    longitud: parseFloat(item.lon),
    nombreCompleto: item.display_name ?? '',
    calle: dir.road || undefined,
    colonia: dir.suburb || dir.neighbourhood || dir.quarter || undefined,
    municipio:
      dir.city || dir.town || dir.municipality || dir.county || undefined,
    estado: dir.state || undefined,
  };
}

export async function buscarDirecciones(
  consulta: string,
  limite = 6,
): Promise<ResultadoGeocodificacion[]> {
  if (consulta.trim().length < 4) return [];
  try {
    const res = await axios.get(URL_BUSQUEDA, {
      params: {
        q: consulta,
        format: 'json',
        addressdetails: 1,
        limit: limite,
        countrycodes: 'mx',
        'accept-language': 'es-MX',
      },
    });
    return (res.data as any[]).map(mapearResultado);
  } catch {
    return [];
  }
}

export async function geocodificarInverso(
  latitud: number,
  longitud: number,
): Promise<ResultadoGeocodificacion | null> {
  try {
    const res = await axios.get(URL_INVERSA, {
      params: {
        lat: latitud,
        lon: longitud,
        format: 'json',
        addressdetails: 1,
        'accept-language': 'es-MX',
      },
    });
    if (!res.data || res.data.error) return null;
    return mapearResultado(res.data);
  } catch {
    return null;
  }
}
