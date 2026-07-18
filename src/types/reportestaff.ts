import { Animal } from './reporte';

export interface ReporteStaff {
  id: string;
  estado_reporte: string;
  municipio: string | null;
  colonia: string | null;
  calle: string | null;
  referencia: string | null;
  latitud?: number;
  longitud?: number;
  created_at: string;
  foto_url: string | null;
  animales: Animal[];
  asociacion: {
    nombre: string | null;
    telefono: string | null;
  };
  distancia_km?: number | null;
}

export interface RespuestaStaffReportes {
  esperando_confirmacion: ReporteStaff[];
  pendientes: ReporteStaff[];
  en_accion: ReporteStaff[];
  completados: ReporteStaff[];
}