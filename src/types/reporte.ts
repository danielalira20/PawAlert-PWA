export interface Reporte {
  id: string;
  foto_url: string;
  tipo_animal: string;
  condicion: string;
  estado_reporte: string;
  latitud: number;
  longitud: number;
  municipio: string | null;
  colonia: string | null;
  created_at: string;
}