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
  // Motor de sugerencias Ruta 1 (BACK01/BACK02) — controlan si se muestra
  // el botón "Registrar llegada a veterinaria": solo aplica cuando ya se
  // aceptó una sugerencia y esa llegada todavía no se registró.
  tiene_sugerencia_aceptada: boolean;
  tiene_llegada_veterinaria_registrada: boolean;
  llegada_zona_registrada: boolean;
  animal_no_localizado_registrado: boolean;
  animal_bajo_resguardo_registrado: boolean;
}

export interface RespuestaStaffReportes {
  esperando_confirmacion: ReporteStaff[];
  pendientes: ReporteStaff[];
  en_accion: ReporteStaff[];
  completados: ReporteStaff[];
}

// Motor de sugerencias Ruta 1 (BACK01/BACK02) — lo que regresa
// POST /reports/{id}/hitos en el campo `sugerencia_aliado` cuando se
// registra el hito 'animal_encontrado' y hay un match compatible. Solo
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

// Lo que regresa POST /reports/{id}/hitos/aceptar-sugerencia — datos de
// contacto y ubicación del aliado veterinario para que el voluntario/staff
// pueda llevar al animal (botón "Cómo llegar" + teléfono de contacto).
export interface ContactoAliado {
  nombre: string | null;
  telefono: string | null;
  email: string | null;
}

export interface UbicacionAliado {
  calle: string | null;
  colonia: string | null;
  municipio: string | null;
  referencia: string | null;
  latitud: number | null;
  longitud: number | null;
}

export interface AceptarSugerenciaResponse {
  contribucion: {
    id: string;
    necesidad_id: string | null;
    reporte_id: string | null;
    oferta_proactiva_id: string | null;
    estado: string;
    created_at: string;
  };
  contacto_aliado: ContactoAliado;
  ubicacion_aliado: UbicacionAliado;
}
