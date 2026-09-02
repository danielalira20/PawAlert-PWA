import { fireEvent, render, waitFor } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import { Alert, Share } from "react-native";

import { PublicEventDetailModal } from "../components/events/discovery/PublicEventDetailModal";
import { usePublicEventDetail } from "../hooks/events/usePublicEventDetail";
import type { EventPublicDetail } from "../types/event";

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }), {
  virtual: true,
});

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));

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

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ token: null }),
}));

jest.mock("../hooks/events/usePublicEventDetail", () => ({
  usePublicEventDetail: jest.fn(),
}));

jest.mock("../components/events/saved/SavedEventButton", () => {
  const { Text } = require("react-native");
  return { SavedEventButton: () => <Text>Guardar evento</Text> };
});

jest.mock("../components/events/discovery/EventReportModal", () => ({
  EventReportModal: () => null,
}));

const mockedUsePublicEventDetail = usePublicEventDetail as jest.Mock;

const detail: EventPublicDetail = {
  id: "event-1",
  tipo: "vacunacion",
  categoria_otro: null,
  titulo: "Jornada de vacunación",
  descripcion: "Atención preventiva para perros y gatos.",
  inicia_at: "2026-09-15T16:00:00.000Z",
  termina_at: "2026-09-15T19:00:00.000Z",
  zona_horaria: "America/Mexico_City",
  municipio: "Puebla",
  estado_ubicacion: "Puebla",
  especies_objetivo: ["Perros", "Gatos"],
  es_gratuito: true,
  costo_centavos: null,
  moneda: "MXN",
  cupo_total: 80,
  cupo_estado: "disponible",
  imagen_url: null,
  imagen_url_expira_at: null,
  imagen_texto_alternativo: null,
  asociacion: {
    id: "association-1",
    nombre: "Huellitas de amor",
    logo_url: null,
    acerca_de: null,
  },
  lugar_nombre: "Centro comunitario",
  direccion_publica: "Av. Siempre Viva 10",
  latitud: 19.04,
  longitud: -98.2,
  modalidad_acceso: "sin_registro",
  enlace_registro_externo: null,
  instrucciones_contacto: null,
  publico_objetivo: "Público general",
  requisitos_asistencia: "Llevar cartilla de vacunación",
  servicios_detalle: "Vacuna antirrábica",
  condiciones_excluidas: [],
  documentos_requeridos: ["Cartilla de vacunación"],
  contacto_institucional_nombre: "Coordinación de eventos",
  contacto_institucional_telefono: "2220000000",
  contacto_institucional_email: "eventos@example.com",
  detalle_costos: null,
  responsable_profesional: "Dra. Ana Pérez",
  cedula_profesional: "1234567",
  institucion_profesional: "Clínica comunitaria",
  datos_profesionales_estado: "verificado",
  accesibilidad: "Acceso a nivel de calle",
  transporte: "Ruta 10",
  estado: "publicado",
  version_publica: 1,
  publicado_at: "2026-08-31T12:00:00.000Z",
  motivo_cancelacion_publico: null,
};

describe("PublicEventDetailModal", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("presenta la información pública y sus acciones sin abandonar el contexto", async () => {
    mockedUsePublicEventDetail.mockReturnValue({
      event: detail,
      isLoading: false,
      error: null,
      retry: jest.fn(),
    });

    const view = await render(
      <PublicEventDetailModal
        eventId="event-1"
        onClose={jest.fn()}
        onError={jest.fn()}
        onLocate={jest.fn()}
      />,
    );

    expect(view.getByText("Jornada de vacunación")).toBeTruthy();
    expect(view.getByText(/Centro comunitario/)).toBeTruthy();
    expect(view.getByText("¿Para quién es?")).toBeTruthy();
    expect(view.getByText("Antes de asistir")).toBeTruthy();
    expect(view.getByText("Compartir")).toBeTruthy();
    expect(view.getByText("Reportar")).toBeTruthy();
    expect(view.getByText("Ver en mapa")).toBeTruthy();
  });

  it("permite reintentar o cerrar cuando el detalle dejó de estar disponible", async () => {
    const retry = jest.fn();
    const onClose = jest.fn();
    mockedUsePublicEventDetail.mockReturnValue({
      event: null,
      isLoading: false,
      error: "El evento ya no está disponible.",
      retry,
    });
    const view = await render(
      <PublicEventDetailModal
        eventId="event-1"
        onClose={onClose}
        onError={jest.fn()}
      />,
    );

    expect(view.getByText("El evento no está disponible")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Reintentar carga del evento"));
    expect(retry).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByLabelText("Cerrar detalle sin reintentar"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("explica que se necesita sesión antes de abrir el reporte", async () => {
    mockedUsePublicEventDetail.mockReturnValue({
      event: detail,
      isLoading: false,
      error: null,
      retry: jest.fn(),
    });
    const onError = jest.fn();
    const view = await render(
      <PublicEventDetailModal
        eventId="event-1"
        onClose={jest.fn()}
        onError={onError}
      />,
    );

    await fireEvent.press(view.getByLabelText(`Reportar ${detail.titulo}`));
    expect(onError).toHaveBeenCalledWith(
      "Inicia sesión para reportar información de este evento.",
    );
  });

  it("amplía la imagen dentro del mismo modal y permite volver al detalle", async () => {
    mockedUsePublicEventDetail.mockReturnValue({
      event: {
        ...detail,
        imagen_url: "https://example.com/cartel.webp",
        imagen_texto_alternativo: "Cartel de la jornada de vacunación",
      },
      isLoading: false,
      error: null,
      retry: jest.fn(),
    });
    const view = await render(
      <PublicEventDetailModal
        eventId="event-1"
        onClose={jest.fn()}
        onError={jest.fn()}
      />,
    );

    await fireEvent.press(view.getByLabelText("Ampliar imagen del evento"));

    expect(
      view.getByLabelText("Vista ampliada de la imagen del evento"),
    ).toBeTruthy();
    expect(view.getByText("Cartel de la jornada de vacunación")).toBeTruthy();

    await fireEvent.press(view.getByLabelText("Volver al detalle del evento"));
    expect(view.getByText("Jornada de vacunación")).toBeTruthy();
  });

  it("copia la información cuando el navegador no ofrece el diálogo de compartir", async () => {
    mockedUsePublicEventDetail.mockReturnValue({
      event: detail,
      isLoading: false,
      error: null,
      retry: jest.fn(),
    });
    jest.spyOn(Share, "share").mockRejectedValue(new Error("No soportado"));
    jest.spyOn(Alert, "alert").mockImplementation(jest.fn());
    const view = await render(
      <PublicEventDetailModal
        eventId="event-1"
        onClose={jest.fn()}
        onError={jest.fn()}
      />,
    );

    await fireEvent.press(view.getByText("Compartir"));

    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalled());
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
      expect.stringContaining("Jornada de vacunación"),
    );
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
      expect.stringContaining("/events?event_id=event-1"),
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      "Información copiada",
      "Puedes pegarla en el mensaje o aplicación que prefieras.",
    );
  });
});
