import { act, renderHook, waitFor } from "@testing-library/react-native";

import { usePublicEvents } from "../hooks/events/usePublicEvents";
import { listPublicEvents } from "../services/eventService";
import type { EventPublicSummary } from "../types/event";

jest.mock("../services/eventService", () => {
  const actual = jest.requireActual("../services/eventService");
  return { ...actual, listPublicEvents: jest.fn() };
});

const mockedListPublicEvents = listPublicEvents as jest.MockedFunction<
  typeof listPublicEvents
>;

const event = { id: "event-1" } as EventPublicSummary;
const secondEvent = { id: "event-2" } as EventPublicSummary;

describe("usePublicEvents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedListPublicEvents.mockResolvedValue({
      items: [event],
      pagina: 1,
      limite: 12,
      total: 2,
      tiene_mas: true,
    });
  });

  it("consulta la primera página con filtros públicos", async () => {
    const filters = { tipo: "vacunacion" as const, gratuito: true };
    const { result } = await renderHook(() => usePublicEvents(filters));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedListPublicEvents).toHaveBeenCalledWith({
      ...filters,
      pagina: 1,
      limite: 12,
    });
    expect(result.current.events).toEqual([event]);
    expect(result.current.total).toBe(2);
  });

  it("agrega la página siguiente sin estirar ni reemplazar la colección", async () => {
    const filters = {};
    const { result } = await renderHook(() => usePublicEvents(filters));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockedListPublicEvents.mockResolvedValueOnce({
      items: [secondEvent],
      pagina: 2,
      limite: 12,
      total: 2,
      tiene_mas: false,
    });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.events).toEqual([event, secondEvent]);
    expect(result.current.hasMore).toBe(false);
  });
});
