export type EstadoReporte = 'pendiente' | 'asignado' | 'en_atencion' | 'cerrado';
export type Condicion = 'green' | 'yellow' | 'red';

export interface Reporte {
  id: string;
  latitud: number;
  longitud: number;
  estado_reporte: EstadoReporte;
  condicion: Condicion;
  foto_url: string;
  created_at: string;
}

export const reportesFalsos: Reporte[] = [
  {
    id: '1',
    latitud: 19.0434,
    longitud: -98.2013,
    estado_reporte: 'pendiente', // Naranja
    condicion: 'yellow',
    foto_url: 'https://images.unsplash.com/photo-1543852786-1cf6624b9987?q=80&w=500&auto=format&fit=crop',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), 
  },
  {
    id: '2',
    latitud: 19.0500,
    longitud: -98.2150,
    estado_reporte: 'asignado', // Verde
    condicion: 'yellow',
    foto_url: 'https://images.unsplash.com/photo-1537151608804-ea2f1ea14a15?q=80&w=500&auto=format&fit=crop',
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(), 
  },
  {
    id: '3',
    latitud: 19.0350,
    longitud: -98.2100,
    estado_reporte: 'en_atencion', // Azul
    condicion: 'red',
    foto_url: 'https://images.unsplash.com/photo-1593134257782-e89567b7718a?q=80&w=500&auto=format&fit=crop',
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(), 
  },
  {
    id: '4',
    latitud: 19.0480,
    longitud: -98.2080,
    estado_reporte: 'cerrado', // Gris
    condicion: 'green',
    foto_url: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?q=80&w=500&auto=format&fit=crop',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), 
  }
];