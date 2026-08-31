import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { EventLifecycleActions } from "../components/events/editor/EventLifecycleActions";

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }), {
  virtual: true,
});

jest.mock("../components/AppModal", () => ({
  AppModal: ({ visible, children }: { visible: boolean; children: unknown }) =>
    visible ? children : null,
}));

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ token: "token-asociacion" }),
}));

const mockPublish = jest.fn();
const mockPause = jest.fn();
const mockCancel = jest.fn();

jest.mock("../services/eventService", () => ({
  createEventIdempotencyKey: (action: string, eventId: string) =>
    `event:${action}:${eventId}:test-key`,
  normalizeEventApiError: (error: Error) => error,
  publishAssociationEvent: (...args: unknown[]) => mockPublish(...args),
  pauseAssociationEvent: (...args: unknown[]) => mockPause(...args),
  cancelAssociationEvent: (...args: unknown[]) => mockCancel(...args),
}));

const publishedResponse = {
  id: "event-1",
  estado: "publicado" as const,
  version_publica: 1,
  updated_at: "2026-08-30T20:00:00Z",
  event_id: "history-1",
  reintento: false,
};

describe("EventLifecycleActions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPublish.mockResolvedValue(publishedResponse);
    mockPause.mockResolvedValue({ ...publishedResponse, estado: "pausado" });
    mockCancel.mockResolvedValue({ ...publishedResponse, estado: "cancelado" });
  });

  it("bloquea la publicación mientras el formulario está incompleto", async () => {
    const view = await render(
      <EventLifecycleActions
        eventId="event-1"
        onError={jest.fn()}
        onSuccess={jest.fn()}
        publishReady={false}
        state="borrador"
      />,
    );

    expect(
      view.getByText("Publicar evento").parent?.props.accessibilityState,
    ).toEqual({ disabled: true });
  });

  it("pausa un evento publicado usando un motivo guiado", async () => {
    const onSuccess = jest.fn();
    const view = await render(
      <EventLifecycleActions
        eventId="event-1"
        onError={jest.fn()}
        onSuccess={onSuccess}
        state="publicado"
      />,
    );

    await fireEvent.press(view.getByText("Pausar evento"));
    await fireEvent.press(view.getByText("Cambio o confirmación de sede"));
    await fireEvent.press(view.getAllByText("Pausar evento").at(-1)!);

    await waitFor(() => {
      expect(mockPause).toHaveBeenCalledWith("token-asociacion", "event-1", {
        motivo: "Cambio o confirmación de sede",
        idempotency_key: "event:pause:event-1:test-key",
      });
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ estado: "pausado" }),
        "pause",
      );
    });
  });

  it("guarda cambios antes de reanudar un evento pausado", async () => {
    const onPreparePublish = jest.fn().mockResolvedValue("event-1");
    const view = await render(
      <EventLifecycleActions
        eventId="event-1"
        onError={jest.fn()}
        onPreparePublish={onPreparePublish}
        onSuccess={jest.fn()}
        state="pausado"
      />,
    );

    await fireEvent.press(view.getByText("Reanudar evento"));
    await fireEvent.press(view.getByText("Publicar ahora"));

    await waitFor(() => {
      expect(onPreparePublish).toHaveBeenCalledTimes(1);
      expect(mockPublish).toHaveBeenCalledWith(
        "token-asociacion",
        "event-1",
        { idempotency_key: "event:publish:event-1:test-key" },
      );
    });
  });
});
