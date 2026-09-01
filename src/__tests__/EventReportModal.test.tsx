import { fireEvent, render, waitFor } from "@testing-library/react-native";

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
});
