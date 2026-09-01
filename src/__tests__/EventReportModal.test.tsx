import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import { EventReportModal } from "../components/events/discovery/EventReportModal";
import { reportEvent } from "../services/eventService";

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }), {
  virtual: true,
});

jest.mock("../components/AppModal", () => {
  const { View } = require("react-native");
  return {
    AppModal: ({
      visible,
      children,
    }: {
      visible: boolean;
      children: React.ReactNode;
    }) => (visible ? <View>{children}</View> : null),
  };
});

jest.mock("../services/eventService", () => ({
  createEventIdempotencyKey: () => "event:report:event-1:test-key",
  normalizeEventApiError: (error: unknown) =>
    error instanceof Error ? error : new Error("No disponible"),
  reportEvent: jest.fn(),
}));

const mockedReportEvent = reportEvent as jest.Mock;

describe("EventReportModal", () => {
  beforeEach(() => mockedReportEvent.mockReset());

  it("exige un motivo predefinido y una descripción suficiente", async () => {
    const onSuccess = jest.fn();
    mockedReportEvent.mockResolvedValue({ id: "report-1" });
    const view = await render(
      <EventReportModal
        eventId="event-1"
        onClose={jest.fn()}
        onError={jest.fn()}
        onSuccess={onSuccess}
        token="token"
        visible
      />,
    );

    await fireEvent.press(view.getByText("Enviar reporte"));
    expect(mockedReportEvent).not.toHaveBeenCalled();

    await fireEvent.press(view.getByText("Ubicación incorrecta"));
    expect(
      view.getByLabelText("Motivo: Ubicación incorrecta").props
        .accessibilityState,
    ).toEqual({ checked: true, disabled: false });
    await fireEvent.changeText(
      view.getByLabelText("Descripción del reporte"),
      "La dirección publicada no corresponde al lugar.",
    );
    await fireEvent.press(view.getByText("Enviar reporte"));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockedReportEvent).toHaveBeenCalledWith("token", "event-1", {
      motivo: "ubicacion_incorrecta",
      descripcion: "La dirección publicada no corresponde al lugar.",
      idempotency_key: "event:report:event-1:test-key",
    });
  });

  it("bloquea envíos repetidos mientras la solicitud sigue pendiente", async () => {
    let resolveRequest: ((value: { id: string }) => void) | undefined;
    mockedReportEvent.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const view = await render(
      <EventReportModal
        eventId="event-1"
        onClose={jest.fn()}
        onError={jest.fn()}
        onSuccess={jest.fn()}
        token="token"
        visible
      />,
    );

    await fireEvent.press(view.getByText("Servicio riesgoso"));
    await fireEvent.changeText(
      view.getByLabelText("Descripción del reporte"),
      "La información publicada parece fraudulenta.",
    );
    await fireEvent.press(view.getByLabelText("Enviar reporte del evento"));

    await waitFor(() => expect(mockedReportEvent).toHaveBeenCalledTimes(1));
    expect(
      view.getByLabelText("Enviar reporte del evento").props.accessibilityState,
    ).toEqual({ disabled: true, busy: true });
    await fireEvent.press(view.getByLabelText("Enviar reporte del evento"));
    expect(mockedReportEvent).toHaveBeenCalledTimes(1);

    await act(async () => resolveRequest?.({ id: "report-1" }));
  });

  it("conserva la intención idempotente cuando el usuario reintenta", async () => {
    mockedReportEvent
      .mockRejectedValueOnce(new Error("Sin conexión"))
      .mockResolvedValueOnce({ id: "report-1" });
    const onError = jest.fn();
    const view = await render(
      <EventReportModal
        eventId="event-1"
        onClose={jest.fn()}
        onError={onError}
        onSuccess={jest.fn()}
        token="token"
        visible
      />,
    );

    await fireEvent.press(view.getByText("Información falsa"));
    await fireEvent.changeText(
      view.getByLabelText("Descripción del reporte"),
      "El horario publicado no corresponde.",
    );
    await fireEvent.press(view.getByLabelText("Enviar reporte del evento"));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Sin conexión"));

    await fireEvent.press(view.getByLabelText("Enviar reporte del evento"));
    await waitFor(() => expect(mockedReportEvent).toHaveBeenCalledTimes(2));
    expect(mockedReportEvent.mock.calls[0][2].idempotency_key).toBe(
      mockedReportEvent.mock.calls[1][2].idempotency_key,
    );
  });
});
