import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { SavedEventButton } from "../components/events/saved/SavedEventButton";
import { useSavedEvents } from "../context/events/SavedEventsContext";
import type { EventPublicSummary } from "../types/event";

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }), {
  virtual: true,
});

jest.mock("../context/events/SavedEventsContext", () => ({
  useSavedEvents: jest.fn(),
}));

jest.mock("../components/AppModal", () => {
  const { View } = require("react-native");
  return {
    AppModal: ({
      visible,
      children,
    }: {
      visible: boolean;
      children: React.ReactNode;
    }) =>
      visible ? (
        <View accessibilityLabel="Confirmación">{children}</View>
      ) : null,
  };
});

const mockedUseSavedEvents = useSavedEvents as jest.Mock;
const setEventSaved = jest.fn().mockResolvedValue(true);

const event: EventPublicSummary = {
  id: "event-1",
  tipo: "bienestar_animal",
  categoria_otro: null,
  titulo: "Taller de bienestar",
  descripcion: "Actividad comunitaria.",
  inicia_at: "2026-09-10T16:00:00Z",
  termina_at: "2026-09-10T18:00:00Z",
  zona_horaria: "America/Mexico_City",
  municipio: "Puebla",
  estado_ubicacion: "Puebla",
  especies_objetivo: ["perro"],
  es_gratuito: true,
  costo_centavos: null,
  moneda: "MXN",
  cupo_total: null,
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
};

function mockSavedState(saved: boolean) {
  mockedUseSavedEvents.mockReturnValue({
    isSaved: () => saved,
    pendingEventIds: new Set<string>(),
    setEventSaved,
  });
}

describe("SavedEventButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setEventSaved.mockResolvedValue(true);
  });

  it("guarda directamente un evento que aún no está en la agenda", async () => {
    mockSavedState(false);
    const onSuccess = jest.fn();
    const view = await render(
      <SavedEventButton event={event} onSuccess={onSuccess} />,
    );

    await fireEvent.press(view.getByText("Guardar evento"));

    await waitFor(() =>
      expect(setEventSaved).toHaveBeenCalledWith(event, true),
    );
    expect(onSuccess).toHaveBeenCalledWith(true);
  });

  it("solicita confirmación antes de quitar un evento guardado", async () => {
    mockSavedState(true);
    const view = await render(<SavedEventButton event={event} />);

    await fireEvent.press(view.getByText("Guardado"));
    expect(view.getByLabelText("Confirmación")).toBeTruthy();

    await fireEvent.press(view.getByText("Quitar evento"));

    await waitFor(() =>
      expect(setEventSaved).toHaveBeenCalledWith(event, false),
    );
  });
});
