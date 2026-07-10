import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../constants/api';

export interface StatsGenerales {
  asociacionesActivas: number;
  reportesAtendidos: number;
  animalesRescatados: number;
}

// Datos públicos y agregados de toda la plataforma — sin auth, GET /stats/generales.
export function useGeneralStats() {
  const [stats, setStats] = useState<StatsGenerales | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const cargar = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/stats/generales`);
      setStats({
        asociacionesActivas: res.data.asociaciones_activas,
        reportesAtendidos: res.data.reportes_atendidos,
        animalesRescatados: res.data.animales_rescatados,
      });
    } catch {
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { stats, isLoading, recargar: cargar };
}