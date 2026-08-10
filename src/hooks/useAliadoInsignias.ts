import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../constants/api';

export interface InsigniaAliado {
  id: string;
  rol: string;
  codigo_insignia: string;
  nivel: string | null;
  progreso: number;
  obtenido_at: string | null;
  mejorado_at: string | null;
}

// GET /red-aliados/me/insignias — mismo criterio que useAliadoImpact:
// consulta separada de /me, solo se llama cuando ya se sabe que el
// usuario tiene perfil de aliado.
export function useAliadoInsignias(enabled: boolean = true) {
  const { token, isLoggedIn } = useAuth();
  const [insignias, setInsignias] = useState<InsigniaAliado[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const cargar = useCallback(async () => {
    if (!enabled || !isLoggedIn || !token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await axios.get<InsigniaAliado[]>(`${API_URL}/red-aliados/me/insignias`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInsignias(res.data);
    } catch {
      setInsignias([]);
    } finally {
      setIsLoading(false);
    }
  }, [token, isLoggedIn, enabled]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { insignias, isLoading, recargar: cargar };
}
