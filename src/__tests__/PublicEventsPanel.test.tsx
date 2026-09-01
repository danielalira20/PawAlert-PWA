import { fireEvent, render } from "@testing-library/react-native";

import {
  buildPublicEventQuery,
  PublicEventsPanel,
} from "../components/events/discovery/PublicEventsPanel";
import { buildEventMapQuery } from "../components/events/discovery/eventDiscoveryFilters";
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
  const { Text, TouchableOpacity } = require("react-native");
  return {
    PublicEventCard: ({
      event,
      onOpenDetail,
    }: {
      event: { id: string; titulo: string };
      onOpenDetail: (event: { id: string; titulo: string }) => void;
    }) => (
      <TouchableOpacity onPress={() => onOpenDetail(event)}>
        <Text>{event.titulo}</Text>
      </TouchableOpacity>
    ),
  };
});

jest.mock("../components/events/discovery/PublicEventDetailModal", () => {
  const { Text } = require("react-native");
  return {
    PublicEventDetailModal: ({ eventId }: { eventId: string | null }) =>
      eventId ? <Text>{`Detalle abierto: ${eventId}`}</Text> : null,
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

  it("comparte los filtros y límites visibles con la capa del mapa", () => {
    const now = new Date("2026-08-31T12:00:00.000Z");
    expect(
      buildEventMapQuery(
        {
          type: "vacunacion",
          cost: "con_costo",
          date: "30_dias",
          species: "Gatos",
          municipality: "Puebla",
        },
        {
          latitudeMin: 18.9,
          latitudeMax: 19.2,
          longitudeMin: -98.4,
          longitudeMax: -98.1,
        },
        now,
      ),
    ).toEqual({
      tipo: "vacunacion",
      gratuito: false,
      especie: "Gatos",
      municipio: "Puebla",
      desde: "2026-08-31T12:00:00.000Z",
      hasta: "2026-09-30T12:00:00.000Z",
      latitud_min: 18.9,
      latitud_max: 19.2,
      longitud_min: -98.4,
      longitud_max: -98.1,
    });
  });

  it("muestra un estado vacío claro dentro de la agenda pública", async () => {
    const view = await render(<PublicEventsPanel />);

    expect(view.getByText("Eventos comunitarios")).toBeTruthy();
    expect(view.getByText("No encontramos eventos")).toBeTruthy();
    expect(view.getByText("Categoría")).toBeTruthy();
  });

  it("notifica los filtros al contenedor para conservarlos entre lista y mapa", async () => {
    const onFiltersChange = jest.fn();
    const filters = {
      type: "todos" as const,
      cost: "todos" as const,
      date: "todos" as const,
      species: "todos" as const,
      municipality: "todos" as const,
    };
    const view = await render(
      <PublicEventsPanel filters={filters} onFiltersChange={onFiltersChange} />,
    );

    await fireEvent.press(view.getByText("Gatos"));

    expect(onFiltersChange).toHaveBeenCalledWith({
      ...filters,
      species: "Gatos",
    });
  });

  it("abre el detalle sin abandonar el listado ni reiniciar sus filtros", async () => {
    mockedUsePublicEvents.mockReturnValue({
      events: [{ id: "event-1", titulo: "Jornada comunitaria" }],
      total: 1,
      hasMore: false,
      isLoading: false,
      isLoadingMore: false,
      isRefreshing: false,
      error: null,
      refresh: jest.fn(),
      loadMore: jest.fn(),
    });
    const view = await render(<PublicEventsPanel />);

    await fireEvent.press(view.getByText("Jornada comunitaria"));

    expect(view.getByText("Detalle abierto: event-1")).toBeTruthy();
    expect(view.getByText("Eventos comunitarios")).toBeTruthy();
  });

  it("delega la apertura al contenedor cuando debe sincronizar la URL", async () => {
    mockedUsePublicEvents.mockReturnValue({
      events: [{ id: "event-1", titulo: "Jornada comunitaria" }],
      total: 1,
      hasMore: false,
      isLoading: false,
      isLoadingMore: false,
      isRefreshing: false,
      error: null,
      refresh: jest.fn(),
      loadMore: jest.fn(),
    });
    const onOpenDetail = jest.fn();
    const view = await render(
      <PublicEventsPanel onOpenDetail={onOpenDetail} />,
    );

    await fireEvent.press(view.getByText("Jornada comunitaria"));

    expect(onOpenDetail).toHaveBeenCalledWith("event-1");
    expect(view.queryByText("Detalle abierto: event-1")).toBeNull();
  });
});
