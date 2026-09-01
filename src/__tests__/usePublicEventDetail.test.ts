import { act, renderHook, waitFor } from "@testing-library/react-native";

import { usePublicEventDetail } from "../hooks/events/usePublicEventDetail";
import { getPublicEvent } from "../services/eventService";

jest.mock("../services/eventService", () => ({
  getPublicEvent: jest.fn(),
  normalizeEventApiError: (error: unknown) =>
    error instanceof Error ? error : new Error("No disponible"),
}));

const mockedGetPublicEvent = getPublicEvent as jest.Mock;

describe("usePublicEventDetail", () => {
  beforeEach(() => mockedGetPublicEvent.mockReset());

  it("permanece inactivo mientras no haya un evento seleccionado", async () => {
    const { result } = await renderHook(() => usePublicEventDetail(null));

    expect(result.current.event).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(mockedGetPublicEvent).not.toHaveBeenCalled();
  });

  it("carga el detalle del evento seleccionado", async () => {
    const detail = { id: "event-1", titulo: "Jornada comunitaria" };
    mockedGetPublicEvent.mockResolvedValue(detail);

    const { result } = await renderHook(() => usePublicEventDetail("event-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockedGetPublicEvent).toHaveBeenCalledWith("event-1");
    expect(result.current.event).toEqual(detail);
    expect(result.current.error).toBeNull();
  });

  it("permite reintentar después de un error", async () => {
    mockedGetPublicEvent
      .mockRejectedValueOnce(new Error("Servicio temporalmente no disponible"))
      .mockResolvedValueOnce({ id: "event-1", titulo: "Jornada comunitaria" });

    const { result } = await renderHook(() => usePublicEventDetail("event-1"));
    await waitFor(() =>
      expect(result.current.error).toBe("Servicio temporalmente no disponible"),
    );

    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.event).toEqual({
      id: "event-1",
      titulo: "Jornada comunitaria",
    });
    expect(result.current.error).toBeNull();
  });
});
