import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "../AuthContext";
import {
  createEventIdempotencyKey,
  listSavedEvents,
  normalizeEventApiError,
  saveEvent,
  unsaveEvent,
} from "../../services/eventService";
import type { EventPublicSummary, EventSavedView } from "../../types/event";

interface SavedEventsContextValue {
  savedEvents: EventSavedView[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  pendingEventIds: ReadonlySet<string>;
  isSaved: (eventId: string) => boolean;
  refresh: () => Promise<void>;
  setEventSaved: (
    event: EventPublicSummary,
    shouldSave: boolean,
  ) => Promise<boolean>;
}

const SavedEventsContext = createContext<SavedEventsContextValue | null>(null);

export function SavedEventsProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [savedEvents, setSavedEvents] = useState<EventSavedView[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(token));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingEventIds, setPendingEventIds] = useState<Set<string>>(
    () => new Set(),
  );
  const actionLocksRef = useRef(new Set<string>());
  const idempotencyKeysRef = useRef(new Map<string, string>());

  const loadSavedEvents = useCallback(
    async (refreshing = false) => {
      await Promise.resolve();

      if (!token) {
        setSavedEvents([]);
        setError(null);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (refreshing) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      try {
        setSavedEvents(await listSavedEvents(token));
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
    // Mantiene el estado disponible para el perfil y los futuros listados.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSavedEvents();
  }, [loadSavedEvents]);

  const refresh = useCallback(async () => {
    await loadSavedEvents(true);
  }, [loadSavedEvents]);

  const savedIds = useMemo(
    () => new Set(savedEvents.map((savedEvent) => savedEvent.evento_id)),
    [savedEvents],
  );

  const isSaved = useCallback(
    (eventId: string) => savedIds.has(eventId),
    [savedIds],
  );

  const setEventSaved = useCallback(
    async (event: EventPublicSummary, shouldSave: boolean) => {
      if (!token) {
        throw new Error("Inicia sesión para guardar este evento.");
      }
      if (actionLocksRef.current.has(event.id)) return false;

      const operation = shouldSave ? "save" : "unsave";
      const intentKey = `${operation}:${event.id}`;
      const idempotencyKey =
        idempotencyKeysRef.current.get(intentKey) ??
        createEventIdempotencyKey(operation, event.id);
      idempotencyKeysRef.current.set(intentKey, idempotencyKey);
      actionLocksRef.current.add(event.id);
      setPendingEventIds((current) => new Set(current).add(event.id));

      try {
        const response = shouldSave
          ? await saveEvent(token, event.id, {
              idempotency_key: idempotencyKey,
            })
          : await unsaveEvent(token, event.id, {
              idempotency_key: idempotencyKey,
            });

        setSavedEvents((current) => {
          const withoutEvent = current.filter(
            (savedEvent) => savedEvent.evento_id !== event.id,
          );
          if (!response.guardado) return withoutEvent;

          return [
            {
              id: response.id ?? event.id,
              evento_id: event.id,
              creado_at: new Date().toISOString(),
              evento: event,
            },
            ...withoutEvent,
          ];
        });
        idempotencyKeysRef.current.delete(intentKey);
        idempotencyKeysRef.current.delete(
          `${shouldSave ? "unsave" : "save"}:${event.id}`,
        );
        return true;
      } catch (requestError) {
        throw normalizeEventApiError(requestError);
      } finally {
        actionLocksRef.current.delete(event.id);
        setPendingEventIds((current) => {
          const next = new Set(current);
          next.delete(event.id);
          return next;
        });
      }
    },
    [token],
  );

  const value = useMemo<SavedEventsContextValue>(
    () => ({
      savedEvents,
      isLoading,
      isRefreshing,
      error,
      pendingEventIds,
      isSaved,
      refresh,
      setEventSaved,
    }),
    [
      error,
      isLoading,
      isRefreshing,
      isSaved,
      pendingEventIds,
      refresh,
      savedEvents,
      setEventSaved,
    ],
  );

  return (
    <SavedEventsContext.Provider value={value}>
      {children}
    </SavedEventsContext.Provider>
  );
}

export function useSavedEvents() {
  const context = useContext(SavedEventsContext);
  if (!context) {
    throw new Error("useSavedEvents debe usarse dentro de SavedEventsProvider");
  }
  return context;
}
