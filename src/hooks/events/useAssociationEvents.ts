import { useCallback, useEffect, useState } from "react";

import { useAuth } from "../../context/AuthContext";
import {
  listAssociationEvents,
  normalizeEventApiError,
} from "../../services/eventService";
import type { EventAssociationView } from "../../types/event";

interface UseAssociationEventsResult {
  events: EventAssociationView[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAssociationEvents(): UseAssociationEventsResult {
  const { token } = useAuth();
  const [events, setEvents] = useState<EventAssociationView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(
    async (refreshing = false) => {
      // Conserva el arranque del efecto asíncrono y evita una actualización
      // síncrona encadenada durante el montaje del panel.
      await Promise.resolve();

      if (!token) {
        setEvents([]);
        setError("Inicia sesión para consultar los eventos de tu asociación.");
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (refreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const response = await listAssociationEvents(token, { limite: 250 });
        setEvents(response);
      } catch (requestError) {
        setError(normalizeEventApiError(requestError).message);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [token],
  );

  useEffect(() => {
    // La carga inicial sincroniza el panel con el inventario remoto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEvents();
  }, [loadEvents]);

  const refresh = useCallback(async () => {
    await loadEvents(true);
  }, [loadEvents]);

  return { events, isLoading, isRefreshing, error, refresh };
}
