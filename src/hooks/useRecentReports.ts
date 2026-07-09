import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../constants/api';

export interface ReporteResumen {
  id: string;
  estado_reporte: string;
  municipio: string | null;
  colonia: string | null;
  calle: string | null;
  created_at: string;
  foto_url: string | null;
  fotos?: string[];
  animal: {
    tipo_animal: string | null;
    condicion: string | null;
    descripcion: string | null;
  } | null;
}

const LIMITE_PREVIEW = 3;

// Mismo endpoint que ya usa MisReportesScreen (GET /reports/me) — aquí solo
// tomamos los primeros 3 tras ordenar por fecha, ya que este hook alimenta
// nada más la vista previa del perfil, no la lista completa.
export function useRecentReports() {
  const { token, isLoggedIn } = useAuth();
  const [reportes, setReportes] = useState<ReporteResumen[]>([]);
  const [totalReportes, setTotalReportes] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const cargar = useCallback(async () => {
    if (!isLoggedIn || !token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/reports/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const todos = (res.data || []) as ReporteResumen[];
      const ordenados = [...todos].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setTotalReportes(ordenados.length);
      setReportes(ordenados.slice(0, LIMITE_PREVIEW));
    } catch {
      setReportes([]);
      setTotalReportes(0);
    } finally {
      setIsLoading(false);
    }
  }, [token, isLoggedIn]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { reportes, totalReportes, isLoading, recargar: cargar };
}