import { useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../constants/api';

export interface PerfilAliadoAdmin {
  id: string;
  tipo: string;
  categorias: string[];
  zona_cobertura: any;
  disponibilidad: string;
  niveles_urgencia_atendida: string[];
  especies_atendidas: string[];
  datos_extra: any;
  verificado_admin: boolean | null;
  created_at: string;
  usuario_id: string;
  usuarios: {
    nombre: string;
    email: string;
    telefono: string;
  };
}

export function useAdminAliados(showToast: (toast: { type: 'success'|'error'|'warning'|'info'; title: string; message: string; }) => void) {
  const { token } = useAuth();
  const [pendientes, setPendientes] = useState<PerfilAliadoAdmin[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cargarPendientes = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/admin/perfiles-aliados-pendientes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPendientes(response.data);
    } catch (error) {
      console.log('Error cargando perfiles aliados pendientes:', error);
      showToast({ type: 'error', title: 'Error', message: 'No se pudieron cargar los perfiles.' });
    } finally {
      setIsLoading(false);
    }
  }, [token, showToast]);

  const resolverPerfil = async (id: string, decision: 'aprobar' | 'rechazar', razon_rechazo?: string) => {
    setIsSubmitting(true);
    try {
      await axios.patch(
        `${API_URL}/admin/perfiles-aliados/${id}/resolver`,
        { decision, razon_rechazo },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast({
        type: 'success',
        title: 'Éxito',
        message: decision === 'aprobar' ? 'Perfil aprobado exitosamente.' : 'Perfil rechazado.'
      });
      // Remove from list
      setPendientes(prev => prev.filter(p => p.id !== id));
      return true;
    } catch (error) {
      console.log('Error resolviendo perfil aliado:', error);
      showToast({ type: 'error', title: 'Error', message: 'No se pudo procesar la solicitud.' });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    pendientes,
    isLoading,
    isSubmitting,
    cargarPendientes,
    resolverPerfil
  };
}
