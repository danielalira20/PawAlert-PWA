import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "../../context/AuthContext";
import { listAdminEventIncidents } from "../../services/eventService";
import type {
  EventAdminIncidentFilters,
  EventAdminIncidentPage,
} from "../../types/event";

const EMPTY_PAGE: EventAdminIncidentPage = {
  items: [],
  pagina: 1,
  limite: 8,
  total: 0,
  tiene_mas: false,
};

export function useAdminEventIncidents(filters: EventAdminIncidentFilters) {
  const { token } = useAuth();
  const requestRef = useRef(0);
  const [page, setPage] = useState<EventAdminIncidentPage>(EMPTY_PAGE);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (refreshing = false) => {
      if (!token) {
        setPage(EMPTY_PAGE);
        setError("Inicia sesión como administrador para revisar incidentes.");
        setIsLoading(false);
        return;
      }
      const requestId = ++requestRef.current;
      if (refreshing) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);
      try {
        const response = await listAdminEventIncidents(token, filters);
        if (requestId === requestRef.current) setPage(response);
      } catch (loadError) {
        if (requestId !== requestRef.current) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No pudimos cargar los incidentes de eventos.",
        );
      } finally {
        if (requestId === requestRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [filters, token],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return {
    page,
    isLoading,
    isRefreshing,
    error,
    refresh: () => load(true),
  };
}
