export interface Animal {
  id?: string | null;
  tipo_animal: string | null;
  condicion: string | null;
  tamanio: string | null;
  sexo: string | null;
  edad_aproximada: string | null;
  descripcion: string | null;
  orden?: number | null;
  es_grupo?: boolean | null;
  cantidad?: number | null;
  trae_crias_nacidas?: boolean | null;
  numero_crias_nacidas?: number | null;
  foto_url?: string | null;   
  fotos?: string[]; 
}

export type UrgencyLevel = 'verde' | 'amarillo' | 'rojo';

/** Punto agregado por zona que recibe un visitante sin sesión en el mapa
 * público — sin id ni datos de un reporte individual, solo densidad. */
export interface ZonaAgregada {
  latitud: number;
  longitud: number;
  cantidad: number;
  nivel_urgencia_max: UrgencyLevel | null;
}

export interface ReportesMapaResponse {
  modo: 'agregado' | 'detallado';
  reportes: Reporte[];
  zonas: ZonaAgregada[];
}

export interface ReportUrgencySnapshot {
  urgency_score: number | null;
  urgency_nivel: UrgencyLevel | null;
  urgency_calculado_at: string | null;
  urgency_proximo_recalculo_at: string | null;
  urgency_excluido: boolean;
}

export interface Reporte {
  id: string;
  foto_url: string | null;
  fotos?: string[];
  tipo_animal: string | null;
  condicion: string | null;
  estado: string;
  estado_reporte: string | null;
  estado_cobertura?: string | null;
  estado_moderacion?: string | null;
  estado_validacion_reporte?: 'procesando' | 'aprobado' | 'revision_manual' | 'rechazado' | null;  urgency_score?: number | null;
  urgency_level?: 'verde' | 'amarillo' | 'rojo' | null;
  urgency_data_status?: 'complete' | 'degraded' | null;
  asociacion_asignada_id?: string | null;
  staff_asignado_id?: string | null;
  candidatos_presentados_at?: string | null;
  latitud: number | null;
  longitud: number | null;
  calle: string | null;
  municipio: string | null;
  colonia: string | null;
  created_at: string;
  confirmacion_voluntario?: string | null;
  animales: Animal[];
}

/** Lista de animales de un reporte. */
export function getAnimales(r: { animales?: Animal[] | null }): Animal[] {
  return r.animales ?? [];
}

const CONDICION_SEVERIDAD: Record<string, number> = { grave: 3, herido: 2, estable: 1 };

function masSevero(animales: Animal[]): Animal | null {
  if (!animales.length) return null;
  return animales.reduce((peor, a) =>
    (CONDICION_SEVERIDAD[a.condicion ?? ''] ?? 0) > (CONDICION_SEVERIDAD[peor.condicion ?? ''] ?? 0) ? a : peor
  );
}

/** El animal con la condición más grave del caso — mismo animal que
 * respalda `condicionMasGrave`/`especieMasGrave`, para leer el resto de
 * sus campos (tamaño, sexo, edad, descripción) sin mezclarlo con otro
 * animal del mismo caso. */
export function animalMasGrave(animales: Animal[]): Animal | null {
  return masSevero(animales);
}

/** Condición más grave entre los animales de un caso — misma regla que
 * `condicion_mas_grave` en el backend (animal_shaping.py). */
export function condicionMasGrave(animales: Animal[]): string | null {
  return masSevero(animales)?.condicion ?? null;
}

/** Especie del animal con la condición más grave — para el ícono del pin. */
export function especieMasGrave(animales: Animal[]): string | null {
  return masSevero(animales)?.tipo_animal ?? null;
}

/** Suma de `cantidad` (no cuenta filas) — un grupo de 8 gatos cuenta como 8. */
export function totalAnimales(animales: Animal[]): number {
  return animales.reduce((total, a) => total + (a.cantidad ?? 1), 0);
}
