import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../constants/api';

export interface InsigniaReputacion {
  id: string;
  rol: string;
  codigo_insignia: string;
  nivel: 'cobre' | 'plata' | 'oro' | null;
  progreso: number;
  obtenido_at: string | null;
  mejorado_at: string | null;
}

/**
 * GET /reputacion/me/insignias?rol=... — mismo patrón que
 * useAliadoInsignias.ts (axios + enabled/isLoggedIn/token).
 */
export function useMisInsignias(rol: string, enabled: boolean = true) {
  const { token, isLoggedIn } = useAuth();
  const [insignias, setInsignias] = useState<InsigniaReputacion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const cargar = useCallback(async () => {
    if (!enabled || !isLoggedIn || !token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await axios.get<InsigniaReputacion[]>(`${API_URL}/reputacion/me/insignias`, {
        params: { rol },
        headers: { Authorization: `Bearer ${token}` },
      });
      setInsignias(res.data);
    } catch (e) {
      console.log('[WARN] no se pudieron cargar las insignias', e);
      setInsignias([]);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, isLoggedIn, token, rol]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { insignias, isLoading, recargar: cargar };
}