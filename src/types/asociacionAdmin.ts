export interface AsociacionPendienteItem {
  id: string;
  nombre: string;
  nombre_responsable: string;
  contacto_telefono: string;
  contacto_email: string;
  logo_url: string | null;
  fotos_count: number;
  created_at: string;
}

export interface AsociacionFoto {
  id: string;
  foto_url: string;
  descripcion: string | null;
  orden: number;
}

export interface AsociacionDetalle {
  id: string;
  nombre: string;
  nombre_responsable: string;
  contacto_telefono: string;
  contacto_email: string;
  acerca_de: string | null;
  logo_url: string | null;
  horario_atencion: string | null;
  radio_km: number;
  tipos_animales: string[];
  calle: string | null;
  colonia: string | null;
  municipio: string | null;
  referencia: string | null;
  latitud: number | null;
  longitud: number | null;
  verificado: boolean;
  motivo_rechazo: string | null;
  created_at: string;
  fotos: AsociacionFoto[];
}