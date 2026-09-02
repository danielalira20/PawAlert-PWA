import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { useAuth } from "../context/AuthContext";
import {
  SavedEventsProvider,
  useSavedEvents,
} from "../context/events/SavedEventsContext";
import {
  listSavedEvents,
  saveEvent,
  unsaveEvent,
} from "../services/eventService";
import type { EventPublicSummary, EventSavedView } from "../types/event";

jest.mock("../context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../services/eventService", () => {
  const actual = jest.requireActual("../services/eventService");
  return {
    ...actual,
    createEventIdempotencyKey: (operation: string, eventId: string) =>
      `event:${operation}:${eventId}:test-key`,
    listSavedEvents: jest.fn(),
    saveEvent: jest.fn(),
    unsaveEvent: jest.fn(),
  };
});

const mockedUseAuth = useAuth as jest.Mock;
const mockedListSavedEvents = listSavedEvents as jest.MockedFunction<
  typeof listSavedEvents
>;
const mockedSaveEvent = saveEvent as jest.MockedFunction<typeof saveEvent>;
const mockedUnsaveEvent = unsaveEvent as jest.MockedFunction<
  typeof unsaveEvent
>;

const event: EventPublicSummary = {
  id: "event-1",
  tipo: "vacunacion",
  categoria_otro: null,
  titulo: "Jornada de vacunación",
  descripcion: "Vacunación comunitaria para perros y gatos.",
  inicia_at: "2026-09-10T16:00:00Z",
  termina_at: "2026-09-10T19:00:00Z",
  zona_horaria: "America/Mexico_City",
  municipio: "Puebla",
  estado_ubicacion: "Puebla",
  especies_objetivo: ["perro", "gato"],
  es_gratuito: true,
  costo_centavos: null,
  moneda: "MXN",
  cupo_total: null,
  cupo_estado: "no_aplica",
  imagen_url: null,
  imagen_url_expira_at: null,
  imagen_texto_alternativo: null,
  asociacion: {
    id: "association-1",
    nombre: "Huellitas de amor",
    logo_url: null,
    acerca_de: null,
  },
};

const savedEvent: EventSavedView = {
  id: "saved-1",
  evento_id: event.id,
  creado_at: "2026-08-31T12:00:00Z",
  evento: event,
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <SavedEventsProvider>{children}</SavedEventsProvider>
);

describe("SavedEventsProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({ token: "user-token" });
    mockedListSavedEvents.mockResolvedValue([]);
    mockedSaveEvent.mockResolvedValue({
      id: "saved-1",
      evento_id: event.id,
      guardado: true,
      event_id: "history-1",
      reintento: false,
    });
    mockedUnsaveEvent.mockResolvedValue({
      id: null,
      evento_id: event.id,
      guardado: false,
      event_id: "history-2",
      reintento: false,
    });
  });

  it("carga la colección del usuario al restaurar la sesión", async () => {
    mockedListSavedEvents.mockResolvedValue([savedEvent]);
    const { result } = await renderHook(() => useSavedEvents(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedListSavedEvents).toHaveBeenCalledWith("user-token");
    expect(result.current.isSaved(event.id)).toBe(true);
  });

  it("guarda y quita el evento con claves idempotentes independientes", async () => {
    const { result } = await renderHook(() => useSavedEvents(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.setEventSaved(event, true);
    });

    expect(mockedSaveEvent).toHaveBeenCalledWith("user-token", event.id, {
      idempotency_key: "event:save:event-1:test-key",
    });
    expect(result.current.isSaved(event.id)).toBe(true);

    await act(async () => {
      await result.current.setEventSaved(event, false);
    });

    expect(mockedUnsaveEvent).toHaveBeenCalledWith("user-token", event.id, {
      idempotency_key: "event:unsave:event-1:test-key",
    });
    expect(result.current.isSaved(event.id)).toBe(false);
  });

  it("no consulta ni conserva guardados cuando no hay sesión", async () => {
    mockedUseAuth.mockReturnValue({ token: null });
    const { result } = await renderHook(() => useSavedEvents(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedListSavedEvents).not.toHaveBeenCalled();
    expect(result.current.savedEvents).toEqual([]);
  });
});
