import { fireEvent, render, waitFor } from "@testing-library/react-native";

import {
  EventModerationPanel,
  shouldUseEventModerationGrid,
} from "../components/events/admin/EventModerationPanel";
import { useAdminEventIncidents } from "../hooks/events/useAdminEventIncidents";
import {
  restoreEventAsAdmin,
  suspendEventAsAdmin,
} from "../services/eventService";
import type { EventAdminIncident } from "../types/event";

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }), {
  virtual: true,
});

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ token: "token-admin" }),
}));

jest.mock("../hooks/events/useAdminEventIncidents", () => ({
  useAdminEventIncidents: jest.fn(),
}));

jest.mock("../services/eventService", () => ({
  createEventIdempotencyKey: (action: string, eventId: string) =>
    `event:${action}:${eventId}:test-key`,
  suspendEventAsAdmin: jest.fn(),
  restoreEventAsAdmin: jest.fn(),
}));

const mockedHook = useAdminEventIncidents as jest.Mock;
const mockedSuspend = suspendEventAsAdmin as jest.MockedFunction<
  typeof suspendEventAsAdmin
>;
const mockedRestore = restoreEventAsAdmin as jest.MockedFunction<
  typeof restoreEventAsAdmin
>;
const mockRefresh = jest.fn().mockResolvedValue(undefined);

const incident: EventAdminIncident = {
  id: "incident-1",
  evento_id: "event-1",
  reportado_por_usuario_id: "private-user-id",
  motivo: "servicio_riesgoso",
  descripcion: "El servicio anunciado podría poner en riesgo a los animales.",
  estado: "pendiente",
  revisado_por_usuario_id: null,
  revisado_at: null,
  resolucion: null,
  resuelto_at: null,
  creado_at: "2026-08-30T18:00:00Z",
  actualizada_at: "2026-08-30T18:00:00Z",
  evento: {
    id: "event-1",
    asociacion_id: "association-1",
    titulo: "Jornada comunitaria",
    tipo: "bienestar_animal",
    estado: "publicado",
    version_publica: 2,
    asociacion: { id: "association-1", nombre: "Huellitas de amor" },
  },
};

function setIncident(nextIncident: EventAdminIncident) {
  mockedHook.mockReturnValue({
    page: {
      items: [nextIncident],
      pagina: 1,
      limite: 8,
      total: 1,
      tiene_mas: false,
    },
    isLoading: false,
    isRefreshing: false,
    error: null,
    refresh: mockRefresh,
  });
}

describe("EventModerationPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setIncident(incident);
    mockedSuspend.mockResolvedValue({
      id: "event-1",
      estado: "suspendido_admin",
      version_publica: 2,
      updated_at: "2026-08-30T19:00:00Z",
      event_id: "history-1",
      reintento: false,
    });
    mockedRestore.mockResolvedValue({
      id: "event-1",
      estado: "pausado",
      version_publica: 2,
      updated_at: "2026-08-30T20:00:00Z",
      event_id: "history-2",
      reintento: false,
    });
  });

  it("usa ancho completo para una tarjeta y cuadrícula solo cuando cabe", () => {
    expect(shouldUseEventModerationGrid(1200, 1)).toBe(false);
    expect(shouldUseEventModerationGrid(1200, 2)).toBe(true);
    expect(shouldUseEventModerationGrid(360, 2)).toBe(false);
  });

  it("envía filtros predefinidos y protege la identidad del reportante", async () => {
    const view = await render(<EventModerationPanel showToast={jest.fn()} />);

    expect(mockedHook).toHaveBeenCalledWith(
      expect.objectContaining({ estado: "pendiente", pagina: 1, limite: 8 }),
    );
    expect(view.queryByText("private-user-id")).toBeNull();

    await fireEvent.press(view.getByText("Revisar incidente"));

    expect(view.getByText(/identidad de quien reportó/i)).toBeTruthy();
    expect(view.queryByText("private-user-id")).toBeNull();
  });

  it("suspende con un motivo guiado e idempotente", async () => {
    const showToast = jest.fn();
    const onModerationChange = jest.fn();
    const view = await render(
      <EventModerationPanel
        onModerationChange={onModerationChange}
        showToast={showToast}
      />,
    );

    await fireEvent.press(view.getByText("Revisar incidente"));
    await fireEvent.press(view.getByText("Suspender evento"));
    await fireEvent.press(view.getByText("Riesgo para la comunidad"));
    await fireEvent.press(view.getByText("Confirmar suspensión"));

    await waitFor(() => expect(mockedSuspend).toHaveBeenCalledTimes(1));
    expect(mockedSuspend).toHaveBeenCalledWith("token-admin", "event-1", {
      motivo: "Servicio potencialmente riesgoso pendiente de aclaración.",
      idempotency_key: "event:suspend:event-1:test-key",
    });
    expect(mockRefresh).toHaveBeenCalled();
    expect(onModerationChange).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Evento suspendido" }),
    );
  });

  it("restaura un evento como pausado con una resolución predefinida", async () => {
    setIncident({
      ...incident,
      estado: "en_revision",
      evento: { ...incident.evento, estado: "suspendido_admin" },
    });
    const view = await render(<EventModerationPanel showToast={jest.fn()} />);

    await fireEvent.press(view.getByText("Revisar incidente"));
    await fireEvent.press(view.getByText("Restaurar como pausado"));
    await fireEvent.press(view.getByText("Información corregida"));
    await fireEvent.press(view.getByText("Confirmar restauración"));

    await waitFor(() => expect(mockedRestore).toHaveBeenCalledTimes(1));
    expect(mockedRestore).toHaveBeenCalledWith("token-admin", "event-1", {
      resolucion:
        "La información fue corregida y el riesgo reportado quedó atendido.",
      idempotency_key: "event:restore:event-1:test-key",
    });
  });

  it("mantiene el historial resuelto en modo de solo lectura", async () => {
    setIncident({ ...incident, estado: "resuelto" });
    const view = await render(<EventModerationPanel showToast={jest.fn()} />);

    await fireEvent.press(view.getByText("Revisar incidente"));

    expect(view.queryByText("Suspender evento")).toBeNull();
    expect(view.queryByText("Restaurar como pausado")).toBeNull();
    expect(
      view.getByText(/no admite una transición administrativa/i),
    ).toBeTruthy();
  });
});
