export interface AnimalStaff {
  tipo_animal: string | null;
  condicion: string | null;
  tamanio: string | null;
  sexo: string | null;
  edad_aproximada: string | null;
  descripcion: string | null;
}

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
  animal: AnimalStaff;
  asociacion: {
    nombre: string | null;
    telefono: string | null;
  };
}

export interface RespuestaStaffReportes {
  pendientes: ReporteStaff[];
  en_accion: ReporteStaff[];
  completados: ReporteStaff[];
}