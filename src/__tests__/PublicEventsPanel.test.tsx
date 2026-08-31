import { render } from "@testing-library/react-native";

import {
  buildPublicEventQuery,
  PublicEventsPanel,
} from "../components/events/discovery/PublicEventsPanel";
import { usePublicEvents } from "../hooks/events/usePublicEvents";

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }), {
  virtual: true,
});

jest.mock("../hooks/events/usePublicEvents", () => ({
  usePublicEvents: jest.fn(),
}));

jest.mock("../components/Toast", () => ({
  Toast: () => null,
  useToast: () => ({
    toast: null,
    translateY: null,
    showToast: jest.fn(),
  }),
}));

jest.mock("../components/events/discovery/PublicEventCard", () => {
  const { Text } = require("react-native");
  return {
    PublicEventCard: ({ event }: { event: { titulo: string } }) => (
      <Text>{event.titulo}</Text>
    ),
  };
});

const mockedUsePublicEvents = usePublicEvents as jest.Mock;

describe("PublicEventsPanel", () => {
  beforeEach(() => {
    mockedUsePublicEvents.mockReturnValue({
      events: [],
      total: 0,
      hasMore: false,
      isLoading: false,
      isLoadingMore: false,
      isRefreshing: false,
      error: null,
      refresh: jest.fn(),
      loadMore: jest.fn(),
    });
  });

  it("traduce opciones predefinidas al contrato del backend", () => {
    const now = new Date("2026-08-31T12:00:00.000Z");
    expect(
      buildPublicEventQuery(
        {
          type: "vacunacion",
          cost: "gratuito",
          date: "7_dias",
          species: "Perros",
          municipality: "Puebla",
        },
        now,
      ),
    ).toEqual({
      tipo: "vacunacion",
      gratuito: true,
      especie: "Perros",
      municipio: "Puebla",
      desde: "2026-08-31T12:00:00.000Z",
      hasta: "2026-09-07T12:00:00.000Z",
    });
  });

  it("muestra un estado vacío claro dentro de la agenda pública", async () => {
    const view = await render(<PublicEventsPanel />);

    expect(view.getByText("Eventos comunitarios")).toBeTruthy();
    expect(view.getByText("No encontramos eventos")).toBeTruthy();
    expect(view.getByText("Categoría")).toBeTruthy();
  });
});
