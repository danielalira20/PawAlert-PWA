import { useCallback, useEffect, useRef, useState } from "react";

import {
  getPublicEvent,
  normalizeEventApiError,
} from "../../services/eventService";
import type { EventPublicDetail } from "../../types/event";

export function usePublicEventDetail(eventId: string | null) {
  const [event, setEvent] = useState<EventPublicDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!eventId) {
      setEvent(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const detail = await getPublicEvent(eventId);
      if (requestId === requestIdRef.current) setEvent(detail);
    } catch (requestError) {
      if (requestId === requestIdRef.current) {
        setEvent(null);
        setError(normalizeEventApiError(requestError).message);
      }
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  return { event, isLoading, error, retry: load };
}
