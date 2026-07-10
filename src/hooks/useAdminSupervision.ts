import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../constants/api';

export interface AsociacionPendienteResumen {
  id: string;
  nombre: string;
  logo_url?: string | null;
  created_at?: string;
}

// Reutiliza GET /admin/asociaciones-pendientes (ya existe, lo usa
// AdminDashboardScreen) — solo lo consumimos aquí para mostrar un resumen
// de "cosas que requieren tu atención" dentro de Mi Perfil.
export function useAdminSupervision(enabled: boolean = true) {
  const { token, isLoggedIn } = useAuth();
  const [pendientes, setPendientes] = useState<AsociacionPendienteResumen[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const cargar = useCallback(async () => {
    if (!enabled || !isLoggedIn || !token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/admin/asociaciones-pendientes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPendientes((res.data || []) as AsociacionPendienteResumen[]);
    } catch {
      setPendientes([]);
    } finally {
      setIsLoading(false);
    }
  }, [token, isLoggedIn, enabled]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { pendientes, totalPendientes: pendientes.length, isLoading, recargar: cargar };
}