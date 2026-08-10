import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../constants/api';

export interface SaldoRol {
  rol: string;
  saldo_disponible: number;
  saldo_reservado: number;
  saldo_total: number;
  restriccion_activa: boolean;
  mensaje_restriccion: string | null;
}

interface ReputacionMeResponse {
  roles: SaldoRol[];
}

/**
 * GET /reputacion/me — mismo patrón que useAliadoInsignias.ts:
 * axios.get con header Bearer, no dispara nada sin token/sesión.
 *
 * Nunca trae puntaje ni estado_interno del Trust Score (el backend ya
 * los excluye a propósito) — solo saldo y un mensaje de restricción ya
 * traducido a texto humano, listo para mostrar tal cual.
 */
export function useMiReputacion(rol: string, enabled: boolean = true) {
  const { token, isLoggedIn } = useAuth();
  const [saldo, setSaldo] = useState<SaldoRol | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const cargar = useCallback(async () => {
    if (!enabled || !isLoggedIn || !token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await axios.get<ReputacionMeResponse>(`${API_URL}/reputacion/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const propio = res.data.roles.find((r) => r.rol === rol) ?? null;
      setSaldo(propio);
    } catch (e) {
      console.log('[WARN] no se pudo cargar la reputación', e);
      setSaldo(null);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, isLoggedIn, token, rol]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { saldo, isLoading, recargar: cargar };
}