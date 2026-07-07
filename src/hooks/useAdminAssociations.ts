import { useCallback, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../constants/api';
import type { AsociacionPendienteItem, AsociacionDetalle } from '../types/asociacionAdmin';

type ShowToastFn = (toast: {
  type: 'success' | 'error' | 'warning';
  title: string;
  message: string;
}) => void;

export function useAdminAssociations(showToast: ShowToastFn) {
  const { token } = useAuth();

  // ── Lista de solicitudes pendientes ───────────────────────────────────
  const [asociaciones, setAsociaciones] = useState<AsociacionPendienteItem[]>([]);
  const [isLoadingLista, setIsLoadingLista] = useState(true);

  const cargarPendientes = useCallback(async () => {
    setIsLoadingLista(true);
    try {
      const res = await axios.get<AsociacionPendienteItem[]>(
        `${API_URL}/admin/asociaciones-pendientes`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setAsociaciones(res.data);
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'Error',
        message: error?.response?.data?.detail || 'No pudimos cargar las asociaciones pendientes.',
      });
    } finally {
      setIsLoadingLista(false);
    }
  }, [token, showToast]);

  // ── Detalle de una asociación específica ──────────────────────────────
  const [detalle, setDetalle] = useState<AsociacionDetalle | null>(null);
  const [isLoadingDetalle, setIsLoadingDetalle] = useState(false);

  const cargarDetalle = useCallback(
    async (asociacionId: string) => {
      setIsLoadingDetalle(true);
      setDetalle(null);
      try {
        const res = await axios.get<AsociacionDetalle>(
          `${API_URL}/admin/asociaciones/${asociacionId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        setDetalle(res.data);
      } catch (error: any) {
        showToast({
          type: 'error',
          title: 'Error',
          message: error?.response?.data?.detail || 'No pudimos cargar el detalle de la solicitud.',
        });
      } finally {
        setIsLoadingDetalle(false);
      }
    },
    [token, showToast],
  );

  const limpiarDetalle = useCallback(() => setDetalle(null), []);

  // ── Aprobar / Rechazar ─────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);

  const aprobar = useCallback(
    async (asociacionId: string): Promise<boolean> => {
      setIsSubmitting(true);
      try {
        await axios.post(
          `${API_URL}/admin/asociaciones/${asociacionId}/aprobar`,
          {},
          { headers: { Authorization: `Bearer ${token}` } },
        );
        setAsociaciones((prev) => prev.filter((a) => a.id !== asociacionId));
        showToast({
          type: 'success',
          title: 'Aprobada',
          message: 'La asociación fue aprobada y ya puede recibir reportes.',
        });
        return true;
      } catch (error: any) {
        showToast({
          type: 'error',
          title: 'Error',
          message: error?.response?.data?.detail || 'No pudimos aprobar la asociación.',
        });
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [token, showToast],
  );

  const rechazar = useCallback(
    async (asociacionId: string, motivo: string): Promise<boolean> => {
      setIsSubmitting(true);
      try {
        await axios.post(
          `${API_URL}/admin/asociaciones/${asociacionId}/rechazar`,
          { motivo },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        setAsociaciones((prev) => prev.filter((a) => a.id !== asociacionId));
        showToast({
          type: 'info',
          title: 'Rechazada',
          message: 'La asociación fue rechazada. El motivo quedó guardado para que lo vea.',
        });
        return true;
      } catch (error: any) {
        showToast({
          type: 'error',
          title: 'Error',
          message: error?.response?.data?.detail || 'No pudimos rechazar la asociación.',
        });
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [token, showToast],
  );

  return {
    // lista
    asociaciones,
    isLoadingLista,
    cargarPendientes,

    // detalle
    detalle,
    isLoadingDetalle,
    cargarDetalle,
    limpiarDetalle,

    // acciones
    aprobar,
    rechazar,
    isSubmitting,
  };
}