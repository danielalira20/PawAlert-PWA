import { useCallback, useEffect, useRef, useState } from "react";

import {
  listMapEvents,
  normalizeEventApiError,
} from "../../services/eventService";
import type { EventMapFilters, EventMapItem } from "../../types/event";

interface UsePublicEventMapResult {
  events: EventMapItem[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const EMPTY_MAP_FILTERS: EventMapFilters = {};

export function usePublicEventMap(
  enabled: boolean,
  filters: EventMapFilters = EMPTY_MAP_FILTERS,
): UsePublicEventMapResult {
  const [events, setEvents] = useState<EventMapItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadEvents = useCallback(async () => {
    if (!enabled) {
      requestIdRef.current += 1;
      setIsLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const response = await listMapEvents({ ...filters, limite: 500 });
      if (requestId !== requestIdRef.current) return;
      setEvents(response);
    } catch (requestError) {
      if (requestId !== requestIdRef.current) return;
      setError(normalizeEventApiError(requestError).message);
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [enabled, filters]);

  useEffect(() => {
    // La capa solo consulta el backend cuando el usuario elige Eventos > Mapa.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEvents();
  }, [loadEvents]);

  return { events, isLoading, error, refresh: loadEvents };
}
