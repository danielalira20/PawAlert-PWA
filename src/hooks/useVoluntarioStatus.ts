import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';

// ─── Formas que expone GET /voluntarios/me (voluntario_service.py) ─────────
interface UltimaPostulacionRaw {
  id: string;
  tipo: string;
  estado: 'pendiente' | 'aceptada' | 'rechazada';
  motivo_rechazo?: string;
  numero_intento: number;
  asociacion_nombre?: string;
  resuelta_at?: string;
  verificacion_hogar?: {
    estado: string;
    modalidad: string;
    motivo_resultado?: string;
    analisis_video_estado?: string;
    updated_at?: string;
    ronda_evidencia_actual?: {
      id: string;
      numero: number;
      tipos_solicitados: string[];
      instrucciones?: string;
      solicitada_at?: string;
    } | null;
  };
}

interface IntentoPrevioRaw {
  id: string;
  numero_intento: number;
  estado: string;
  motivo_rechazo?: string;
  created_at: string;
  resuelta_at?: string;
  asociacion_nombre?: string;
}

interface VoluntarioMeResponse {
  tiene_perfil_voluntario: boolean;
  voluntario_id?: string;
  estado?: string;
  asociacion_id?: string;
  ultima_postulacion?: UltimaPostulacionRaw | null;
  intentos_previos?: IntentoPrevioRaw[];
  tiene_capacidades?: boolean;
}

// ─── Forma que ya consume MiPostulacionScreen.tsx ──────────────────────────
export interface VoluntarioStatusResponse {
  voluntario: {
    id: string;
    tipo?: string;
    estado: string;
    asociacion_id?: string;
    tiene_capacidades?: boolean;
  } | null;
  postulacion_actual?: {
    estado: string;
    motivo_rechazo?: string;
    numero_intento: number;
    asociacion_nombre?: string;
    resuelta_at?: string;
    verificacion_hogar?: {
      estado: string;
      modalidad: string;
      motivo_resultado?: string;
      analisis_video_estado?: string;
      updated_at?: string;
      ronda_evidencia_actual?: {
        id: string;
        numero: number;
        tipos_solicitados: string[];
        instrucciones?: string;
        solicitada_at?: string;
      } | null;
    };
  };
  intentos_previos?: Array<{
    id: string;
    numero_intento: number;
    estado: string;
    motivo_rechazo?: string;
    created_at: string;
  }>;
}

export function useVoluntarioStatus() {
  const { token } = useAuth();
  const [data, setData] = useState<VoluntarioStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!token) {
      setData(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await axios.get<VoluntarioMeResponse>(
        `${API_URL}/voluntarios/me`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const raw = response.data;

      if (!raw.tiene_perfil_voluntario) {
        setData({ voluntario: null });
        return;
      }

      setData({
        voluntario: {
          id: raw.voluntario_id!,
          tipo: raw.ultima_postulacion?.tipo,
          estado: raw.estado!,
          asociacion_id: raw.asociacion_id,
          tiene_capacidades: raw.tiene_capacidades,
        },
        postulacion_actual: raw.ultima_postulacion
          ? {
              estado: raw.ultima_postulacion.estado,
              motivo_rechazo: raw.ultima_postulacion.motivo_rechazo,
              numero_intento: raw.ultima_postulacion.numero_intento,
              asociacion_nombre: raw.ultima_postulacion.asociacion_nombre,
              resuelta_at: raw.ultima_postulacion.resuelta_at,
              verificacion_hogar: raw.ultima_postulacion.verificacion_hogar,
            }
          : undefined,
        intentos_previos: (raw.intentos_previos || []).map((intento) => ({
          id: intento.id,
          numero_intento: intento.numero_intento,
          estado: intento.estado,
          motivo_rechazo: intento.motivo_rechazo,
          created_at: intento.created_at,
        })),
      });
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          err.message ||
          'Error al obtener el estado de postulación'
      );
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchStatus,
  };
}
