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

export interface ImpactoReportante {
  total: number;
  rescatados: number;
  enProceso: number;
  porcentajeRescate: number;

  // Nuevo: desglose por tipo de animal reportado
  porTipoAnimal: { perro: number; gato: number; otro: number };

  // Nuevo: desglose por estado real del reporte (para la barra apilada)
  porEstado: Record<string, number>;

  // Nuevo: desglose por condición del animal al momento del reporte
  porCondicion: { estable: number; herido: number; grave: number };

  // Nuevo: constancia — desde cuándo reporta y en cuántos meses distintos
  primerReporte: string | null; // ISO date del reporte más antiguo
  mesesActivos: number; // # de meses calendario distintos con al menos 1 reporte
}

const LIMITE_PREVIEW = 3;

const IMPACTO_VACIO: ImpactoReportante = {
  total: 0,
  rescatados: 0,
  enProceso: 0,
  porcentajeRescate: 0,
  porTipoAnimal: { perro: 0, gato: 0, otro: 0 },
  porEstado: {},
  porCondicion: { estable: 0, herido: 0, grave: 0 },
  primerReporte: null,
  mesesActivos: 0,
};

export function useRecentReports() {
  const { token, isLoggedIn } = useAuth();
  const [reportes, setReportes] = useState<ReporteResumen[]>([]);
  const [totalReportes, setTotalReportes] = useState(0);
  const [impacto, setImpacto] = useState<ImpactoReportante>(IMPACTO_VACIO);
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

      const total = ordenados.length;
      const rescatados = ordenados.filter((r) => r.estado_reporte === 'cerrado').length;
      const enProceso = total - rescatados;
      const porcentajeRescate = total > 0 ? Math.round((rescatados / total) * 100) : 0;

      // ── Nuevos desgloses (todo del mismo array, sin llamada extra) ──────
      const porTipoAnimal = { perro: 0, gato: 0, otro: 0 };
      const porCondicion = { estable: 0, herido: 0, grave: 0 };
      const porEstado: Record<string, number> = {};
      const mesesSet = new Set<string>();

      ordenados.forEach((r) => {
        const tipo = r.animal?.tipo_animal?.toLowerCase();
        if (tipo === 'perro') porTipoAnimal.perro += 1;
        else if (tipo === 'gato') porTipoAnimal.gato += 1;
        else porTipoAnimal.otro += 1;

        const cond = r.animal?.condicion?.toLowerCase();
        if (cond === 'estable') porCondicion.estable += 1;
        else if (cond === 'herido') porCondicion.herido += 1;
        else if (cond === 'grave') porCondicion.grave += 1;

        porEstado[r.estado_reporte] = (porEstado[r.estado_reporte] || 0) + 1;

        const d = new Date(r.created_at);
        mesesSet.add(`${d.getFullYear()}-${d.getMonth()}`);
      });

      // ordenados ya viene desc por fecha, así que el último elemento es el
      // reporte más antiguo — no hace falta recorrer de nuevo para buscarlo.
      const primerReporte = total > 0 ? ordenados[total - 1].created_at : null;

      setTotalReportes(total);
      setReportes(ordenados.slice(0, LIMITE_PREVIEW));
      setImpacto({
        total,
        rescatados,
        enProceso,
        porcentajeRescate,
        porTipoAnimal,
        porEstado,
        porCondicion,
        primerReporte,
        mesesActivos: mesesSet.size,
      });
    } catch {
      setReportes([]);
      setTotalReportes(0);
      setImpacto(IMPACTO_VACIO);
    } finally {
      setIsLoading(false);
    }
  }, [token, isLoggedIn]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { reportes, totalReportes, impacto, isLoading, recargar: cargar };
}