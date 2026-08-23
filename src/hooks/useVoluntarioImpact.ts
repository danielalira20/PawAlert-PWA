import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../constants/api';
import type { ImpactoReportante } from './useRecentReports';
import { Animal, getAnimales, totalAnimales } from '../types/reporte';

export type ImpactoVoluntario = ImpactoReportante;

interface ReporteVoluntarioResumen {
  estado_reporte: string;
  created_at: string;
  animales: Animal[];
}

interface RespuestaVoluntarioReportes {
  pendientes: ReporteVoluntarioResumen[];
  en_accion: ReporteVoluntarioResumen[];
  completados: ReporteVoluntarioResumen[];
  historial: ReporteVoluntarioResumen[];
}

const IMPACTO_VACIO: ImpactoVoluntario = {
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

// Mismo cálculo que useStaffImpact.ts, pero contra GET /voluntarios/me/reportes
// — /staff/me/reportes exige rol == "staff" a nivel backend y por eso no
// sirve para voluntario_interno/voluntario_externo (403). El shape de
// respuesta es idéntico (mismos 4 buckets), así que la lógica se reutiliza tal cual.
export function useVoluntarioImpact(enabled: boolean = true) {
  const { token, isLoggedIn } = useAuth();
  const [impacto, setImpacto] = useState<ImpactoVoluntario>(IMPACTO_VACIO);
  const [isLoading, setIsLoading] = useState(true);

  const cargar = useCallback(async () => {
    if (!enabled || !isLoggedIn || !token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await axios.get<RespuestaVoluntarioReportes>(`${API_URL}/voluntarios/me/reportes`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const todos: ReporteVoluntarioResumen[] = [
        ...(res.data.pendientes || []),
        ...(res.data.en_accion || []),
        ...(res.data.completados || []),
        ...(res.data.historial || []),
      ];

      const total = todos.length;
      // Igual que en Reportante/Asociación/Staff: "rescatado" cuenta como en
      // proceso (aún no cerrado formalmente); solo "cerrado" cuenta como
      // resuelto, para que el % signifique lo mismo en todos los roles.
      const rescatados = todos.filter((r) => r.estado_reporte === 'cerrado').length;
      const enProceso = total - rescatados;
      const porcentajeRescate = total > 0 ? Math.round((rescatados / total) * 100) : 0;
      const animalesRescatados = todos
        .filter((r) => r.estado_reporte === 'cerrado')
        .reduce((sum, r) => sum + totalAnimales(getAnimales(r)), 0);

      const porTipoAnimal = { perro: 0, gato: 0, otro: 0 };
      const porCondicion = { estable: 0, herido: 0, grave: 0 };
      const porEstado: Record<string, number> = {};
      const mesesSet = new Set<string>();
      let masAntiguo: string | null = null;

      todos.forEach((r) => {
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

        if (!masAntiguo || new Date(r.created_at) < new Date(masAntiguo)) {
          masAntiguo = r.created_at;
        }
      });

      setImpacto({
        total,
        rescatados,
        enProceso,
        porcentajeRescate,
        animalesRescatados,
        porTipoAnimal,
        porEstado,
        porCondicion,
        primerReporte: masAntiguo,
        mesesActivos: mesesSet.size,
      });
    } catch {
      setImpacto(IMPACTO_VACIO);
    } finally {
      setIsLoading(false);
    }
  }, [token, isLoggedIn, enabled]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { impacto, isLoading, recargar: cargar };
}
