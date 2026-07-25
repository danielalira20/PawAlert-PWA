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

// Motor de sugerencias Ruta 1 (BACK01/BACK02) — lo que regresa
// POST /reports/{id}/hitos en el campo `sugerencia_aliado` cuando se
// registra el hito 'encontre_animal' y hay un match compatible. Solo
// informativo hasta que se acepta vía
// POST /reports/{id}/hitos/aceptar-sugerencia.
export interface SugerenciaAliado {
  oferta_id: string;
  perfil_apoyo_id: string;
  nombre: string;
  distancia_km: number;
  unidad: string;
  capacidad_disponible: number;
  nivel_urgencia: string;
}