import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';

export interface VoluntarioData {
  id?: string;
  nombre: string;
  apellido_paterno: string;
  apellido_materno?: string;
  email: string;
  telefono: string;
}

export interface CapacidadesData {
  disponibilidad?: { dias?: string[]; horarios?: { de: string; a: string }[] };
  ofrece_casa_hogar?: boolean;
  capacidad_animales?: number;
  especies?: string[];
  tamanios?: string[];
  tiene_vehiculo?: boolean;
  motivo_voluntario?: string;
  experiencia_previa?: string;
  latitud?: number;
  longitud?: number;
}

export interface PostulacionItem {
  id: string;
  voluntario_id: string;
  tipo?: 'interno' | 'externo';
  estado: 'pendiente' | 'aceptada' | 'rechazada';
  motivo_rechazo?: string;
  numero_intento: number;
  created_at: string;
  resuelta_at?: string;
  voluntario?: VoluntarioData;
  capacidades?: CapacidadesData | null;
}

export interface PostulacionesResponse {
  postulaciones: PostulacionItem[];
  intentos_previos: { [voluntario_id: string]: PostulacionItem[] };
  pendientes_count: number;
}

export function usePostulacionesAsociacion() {
  const { token } = useAuth();
  const [data, setData] = useState<PostulacionesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPostulaciones = async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const response = await axios.get(`${API_URL}/associations/me/postulaciones`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // 1. Extraemos el arreglo que manda el backend
      const rawData = response.data || [];

      // 2. Calculamos el total de pendientes manualmente
      const pendientesCount = rawData.filter((p: any) => p.estado === 'pendiente').length;

      // 3. Traducimos los nombres de las variables (Adaptador)
      const postulacionesFormateadas = rawData.map((item: any) => ({
        id: item.postulacion_id,            // Backend: postulacion_id -> Frontend: id
        voluntario_id: item.voluntario_id,
        tipo: item.tipo,
        estado: item.estado,
        motivo_rechazo: item.motivo_rechazo,
        numero_intento: item.numero_intento,
        created_at: item.created_at,
        resuelta_at: item.resuelta_at,
        voluntario: item.postulante,        // Backend: postulante -> Frontend: voluntario
        capacidades: item.capacidades,
      }));

      // 4. Mapeamos el historial de intentos previos
      const intentosPreviosMap: any = {};
      rawData.forEach((item: any) => {
        if (item.historial_intentos_previos && item.historial_intentos_previos.length > 0) {
          intentosPreviosMap[item.voluntario_id] = item.historial_intentos_previos.map((h: any) => ({
            id: h.postulacion_id,
            voluntario_id: item.voluntario_id,
            estado: h.estado,
            motivo_rechazo: h.motivo_rechazo,
            numero_intento: h.numero_intento,
            created_at: h.created_at,
          }));
        }
      });

      // 5. Guardamos la data estructurada exactamente como la pide el PostulacionesPanel
      setData({
        postulaciones: postulacionesFormateadas,
        pendientes_count: pendientesCount,
        intentos_previos: intentosPreviosMap
      });

    } catch (err: any) {
      const message = err.response?.data?.detail || 'Error al cargar postulaciones';
      setError(message);
      console.error('Error fetching postulaciones:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPostulaciones();
  }, [token]);

  return { data, isLoading, error, refetch: fetchPostulaciones };
}
