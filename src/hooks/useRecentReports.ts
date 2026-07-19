import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../constants/api';
import { Animal, getAnimales, totalAnimales } from '../types/reporte';

export interface ReporteResumen {
  id: string;
  estado_reporte: string;
  municipio: string | null;
  colonia: string | null;
  calle: string | null;
  created_at: string;
  foto_url: string | null;
  fotos?: string[];
  animales: Animal[];
}

export interface ImpactoReportante {
  total: number;
  rescatados: number;
  enProceso: number;
  porcentajeRescate: number;
  // Suma real de animales (campo `cantidad`) en reportes cerrados — no
  // confundir con `rescatados`, que cuenta reportes/casos, no animales.
  animalesRescatados: number;

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
  animalesRescatados: 0,
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
      const animalesRescatados = ordenados
        .filter((r) => r.estado_reporte === 'cerrado')
        .reduce((sum, r) => sum + totalAnimales(getAnimales(r)), 0);

      // ── Nuevos desgloses (todo del mismo array, sin llamada extra) ──────
      const porTipoAnimal = { perro: 0, gato: 0, otro: 0 };
      const porCondicion = { estable: 0, herido: 0, grave: 0 };
      const porEstado: Record<string, number> = {};
      const mesesSet = new Set<string>();

      ordenados.forEach((r) => {
        // Un caso puede traer varios animales — cada uno pesa por su
        // `cantidad` (un grupo de 8 gatos cuenta como 8, no como 1 fila).
        getAnimales(r).forEach((a) => {
          const cantidad = a.cantidad ?? 1;
          const tipo = a.tipo_animal?.toLowerCase();
          if (tipo === 'perro') porTipoAnimal.perro += cantidad;
          else if (tipo === 'gato') porTipoAnimal.gato += cantidad;
          else porTipoAnimal.otro += cantidad;

          const cond = a.condicion?.toLowerCase();
          if (cond === 'estable') porCondicion.estable += cantidad;
          else if (cond === 'herido') porCondicion.herido += cantidad;
          else if (cond === 'grave') porCondicion.grave += cantidad;
        });

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
        animalesRescatados,
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