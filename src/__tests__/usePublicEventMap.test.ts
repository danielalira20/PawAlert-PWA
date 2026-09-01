import { renderHook, waitFor } from "@testing-library/react-native";

import { usePublicEventMap } from "../hooks/events/usePublicEventMap";
import { listMapEvents } from "../services/eventService";
import type { EventMapItem } from "../types/event";

jest.mock("../services/eventService", () => {
  const actual = jest.requireActual("../services/eventService");
  return { ...actual, listMapEvents: jest.fn() };
});

const mockedListMapEvents = listMapEvents as jest.MockedFunction<
  typeof listMapEvents
>;

describe("usePublicEventMap", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedListMapEvents.mockResolvedValue([{ id: "event-1" } as EventMapItem]);
  });

  it("no consulta la capa mientras el modo mapa está desactivado", async () => {
    const { result } = await renderHook(() => usePublicEventMap(false));

    expect(mockedListMapEvents).not.toHaveBeenCalled();
    expect(result.current.events).toEqual([]);
  });

  it("consulta los eventos georreferenciados al activar la capa", async () => {
    const filters = { tipo: "vacunacion" as const };
    const { result } = await renderHook(() => usePublicEventMap(true, filters));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedListMapEvents).toHaveBeenCalledWith({
      tipo: "vacunacion",
      limite: 500,
    });
    expect(result.current.events).toEqual([{ id: "event-1" }]);
  });
});
