export interface Reporte {
  id: string;
  foto_url: string | null;
  fotos?: string[];
  tipo_animal: string | null;
  condicion: string | null;
  estado: string;
  estado_reporte: string | null;
  latitud: number | null;
  longitud: number | null;
  municipio: string | null;
  colonia: string | null;
  created_at: string;
  animal?: {
    tipo_animal: string | null;
    condicion: string | null;
    tamanio: string | null;
    sexo: string | null;
    descripcion: string | null;
  } | null;
}