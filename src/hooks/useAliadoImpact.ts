import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../constants/api';

export interface OfertaImpacto {
  oferta_id: string;
  categoria: string;
  subcategoria: string | null;
  capacidad_declarada: number;
  capacidad_disponible: number;
  unidad: string;
  activa: boolean;
}

export interface AplicacionImpacto {
  fecha: string;
  cantidad: string | null;
  nota: string | null;
}

export interface ImpactoAliado {
  tipo: string | null;
  total_contribuciones: number;
  asociaciones_ayudadas: number;
  ofertas: OfertaImpacto[];
  aplicaciones: AplicacionImpacto[];
}

const IMPACTO_VACIO: ImpactoAliado = {
  tipo: null,
  total_contribuciones: 0,
  asociaciones_ayudadas: 0,
  ofertas: [],
  aplicaciones: [],
};

// FRONT03/BACK04 — separado de GET /red-aliados/me a propósito, mismo
// criterio que useStaffImpact/useAssociationImpact: /me es la existencia
// barata (tiene_perfil_apoyo), esto es la consulta pesada, solo se llama
// cuando /me ya confirmó que el usuario tiene perfil de aliado.
export function useAliadoImpact(enabled: boolean = true) {
  const { token, isLoggedIn } = useAuth();
  const [impacto, setImpacto] = useState<ImpactoAliado>(IMPACTO_VACIO);
  const [isLoading, setIsLoading] = useState(true);

  const cargar = useCallback(async () => {
    if (!enabled || !isLoggedIn || !token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await axios.get<ImpactoAliado>(`${API_URL}/red-aliados/me/impacto`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setImpacto(res.data);
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
