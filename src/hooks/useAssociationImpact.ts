import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../constants/api';
import type { ImpactoReportante } from './useRecentReports';
import { Animal, getAnimales } from '../types/reporte';

// Misma forma que ImpactoReportante — así ambos roles pueden reutilizar,
// si hace falta, el mismo tipo de componente visual sin duplicar interfaces.
export type ImpactoAsociacion = ImpactoReportante;

interface ReporteAsignadoResumen {
  estado_reporte: string;
  created_at: string;
  animal: Animal | null;
  animales?: Animal[];
}

const IMPACTO_VACIO: ImpactoAsociacion = {
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

// Reutiliza GET /associations/me/reportes (el mismo que ya usa
// AssociationStatusScreen) — no hace falta ningún endpoint nuevo.
// `enabled` evita la llamada para usuarios que no son de una asociación
// (reportante/staff/admin), ya que las reglas de hooks no permiten llamar
// useAssociationImpact() de forma condicional desde el componente.
export function useAssociationImpact(enabled: boolean = true) {
  const { token, isLoggedIn } = useAuth();
  const [impacto, setImpacto] = useState<ImpactoAsociacion>(IMPACTO_VACIO);
  const [isLoading, setIsLoading] = useState(true);

  const cargar = useCallback(async () => {
    if (!enabled || !isLoggedIn || !token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/associations/me/reportes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const todos = (res.data || []) as ReporteAsignadoResumen[];

      const total = todos.length;
      const rescatados = todos.filter((r) => r.estado_reporte === 'cerrado').length;
      const enProceso = total - rescatados;
      const porcentajeRescate = total > 0 ? Math.round((rescatados / total) * 100) : 0;

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