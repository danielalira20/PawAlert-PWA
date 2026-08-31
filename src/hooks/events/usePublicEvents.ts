import { useCallback, useEffect, useRef, useState } from "react";

import {
  listPublicEvents,
  normalizeEventApiError,
} from "../../services/eventService";
import type { EventPublicFilters, EventPublicSummary } from "../../types/event";

interface UsePublicEventsResult {
  events: EventPublicSummary[];
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
}

const PAGE_SIZE = 12;

export function usePublicEvents(
  filters: Omit<EventPublicFilters, "pagina" | "limite">,
): UsePublicEventsResult {
  const [events, setEvents] = useState<EventPublicSummary[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const loadingMoreRef = useRef(false);

  const loadPage = useCallback(
    async (
      requestedPage: number,
      mode: "initial" | "refresh" | "more" = "initial",
    ) => {
      if (mode === "more" && loadingMoreRef.current) return;

      const requestId = ++requestIdRef.current;
      if (mode === "initial") setIsLoading(true);
      if (mode === "refresh") setIsRefreshing(true);
      if (mode === "more") {
        loadingMoreRef.current = true;
        setIsLoadingMore(true);
      }
      setError(null);

      try {
        const response = await listPublicEvents({
          ...filters,
          pagina: requestedPage,
          limite: PAGE_SIZE,
        });
        if (requestId !== requestIdRef.current) return;

        setEvents((current) =>
          mode === "more" ? [...current, ...response.items] : response.items,
        );
        setPage(response.pagina);
        setTotal(response.total);
        setHasMore(response.tiene_mas);
      } catch (requestError) {
        if (requestId !== requestIdRef.current) return;
        setError(normalizeEventApiError(requestError).message);
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
          setIsLoadingMore(false);
          loadingMoreRef.current = false;
        }
      }
    },
    [filters],
  );

  useEffect(() => {
    // Cada cambio de filtro representa una consulta nueva desde la página 1.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPage(1);
  }, [loadPage]);

  const refresh = useCallback(async () => {
    await loadPage(1, "refresh");
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading || loadingMoreRef.current) return;
    await loadPage(page + 1, "more");
  }, [hasMore, isLoading, loadPage, page]);

  return {
    events,
    total,
    hasMore,
    isLoading,
    isLoadingMore,
    isRefreshing,
    error,
    refresh,
    loadMore,
  };
}
