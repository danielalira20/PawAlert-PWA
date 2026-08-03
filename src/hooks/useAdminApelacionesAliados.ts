import { useState, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';

export interface ApelacionAliado {
  id: string;
  mensaje: string;
  documentos_urls: string[];
  created_at: string;
  perfil_apoyo: {
    id: string;
    datos_extra: any;
    tipo: string;
    categorias?: string[];
    especies_atendidas?: string[];
    niveles_urgencia_atendida?: string[];
    usuario_id: string;
    usuarios: {
      nombre: string;
      apellido_paterno: string;
      email: string;
      telefono?: string;
    };
  };
}

export function useAdminApelacionesAliados() {
  const { token } = useAuth();
  const [apelaciones, setApelaciones] = useState<ApelacionAliado[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchApelaciones = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/admin/apelaciones-aliados`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setApelaciones(res.data);
    } catch (err) {
      console.error('Error obteniendo apelaciones de aliados', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const resolverApelacion = async (apelacionId: string, decision: 'aprobar' | 'rechazar', respuestaAdmin: string) => {
    try {
      await axios.patch(`${API_URL}/admin/apelaciones-aliados/${apelacionId}`, {
        decision,
        respuesta: respuestaAdmin,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchApelaciones();
    } catch (err) {
      console.error('Error resolviendo apelación', err);
      throw err;
    }
  };

  return { apelaciones, loading, fetchApelaciones, resolverApelacion };
}
