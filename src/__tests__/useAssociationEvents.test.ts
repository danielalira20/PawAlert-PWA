import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useAuth } from "../context/AuthContext";
import { useAssociationEvents } from "../hooks/events/useAssociationEvents";
import { listAssociationEvents } from "../services/eventService";
import type { EventAssociationView } from "../types/event";

jest.mock("../context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../services/eventService", () => {
  const actual = jest.requireActual("../services/eventService");
  return {
    ...actual,
    listAssociationEvents: jest.fn(),
  };
});

const mockedUseAuth = useAuth as jest.Mock;
const mockedListAssociationEvents =
  listAssociationEvents as jest.MockedFunction<typeof listAssociationEvents>;

const event = {
  id: "evento-1",
  estado: "publicado",
  actualizada_at: "2026-08-30T20:00:00Z",
} as EventAssociationView;

describe("useAssociationEvents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({ token: "token-asociacion" });
  });

  it("carga el inventario completo de la asociación", async () => {
    mockedListAssociationEvents.mockResolvedValueOnce([event]);

    const { result } = await renderHook(() => useAssociationEvents());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedListAssociationEvents).toHaveBeenCalledWith(
      "token-asociacion",
      {
        limite: 250,
      },
    );
    expect(result.current.events).toEqual([event]);
    expect(result.current.error).toBeNull();
  });

  it("permite actualizar la lista sin reemplazarla por un estado de carga inicial", async () => {
    mockedListAssociationEvents
      .mockResolvedValueOnce([event])
      .mockResolvedValueOnce([{ ...event, id: "evento-2" }]);

    const { result } = await renderHook(() => useAssociationEvents());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.events[0].id).toBe("evento-2");
    expect(result.current.isRefreshing).toBe(false);
  });

  it("no consulta el backend sin una sesión y devuelve un mensaje útil", async () => {
    mockedUseAuth.mockReturnValue({ token: null });

    const { result } = await renderHook(() => useAssociationEvents());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedListAssociationEvents).not.toHaveBeenCalled();
    expect(result.current.error).toContain("Inicia sesión");
  });
});
