import { render } from "@testing-library/react-native";

import {
  SavedEventsPanel,
  shouldUseSavedEventsGrid,
} from "../components/events/saved/SavedEventsPanel";
import { useSavedEvents } from "../context/events/SavedEventsContext";

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }), {
  virtual: true,
});

jest.mock("../context/events/SavedEventsContext", () => ({
  useSavedEvents: jest.fn(),
}));

jest.mock("../components/Toast", () => ({
  Toast: () => null,
  useToast: () => ({
    toast: null,
    translateY: null,
    showToast: jest.fn(),
  }),
}));

jest.mock("../components/events/saved/SavedEventCard", () => {
  const { Text } = require("react-native");
  return {
    SavedEventCard: ({ wide }: { wide: boolean }) => (
      <Text>
        {wide ? "Tarjeta compacta en cuadrícula" : "Tarjeta centrada"}
      </Text>
    ),
  };
});

jest.mock("../components/events/discovery/PublicEventDetailModal", () => ({
  PublicEventDetailModal: () => null,
}));

const mockedUseSavedEvents = useSavedEvents as jest.Mock;

describe("SavedEventsPanel", () => {
  beforeEach(() => {
    mockedUseSavedEvents.mockReturnValue({
      savedEvents: [],
      isLoading: false,
      isRefreshing: false,
      error: null,
      refresh: jest.fn(),
    });
  });

  it("solo usa cuadrícula cuando hay varias tarjetas y ancho suficiente", () => {
    expect(shouldUseSavedEventsGrid(1200, 1)).toBe(false);
    expect(shouldUseSavedEventsGrid(1200, 2)).toBe(true);
    expect(shouldUseSavedEventsGrid(390, 2)).toBe(false);
  });

  it("explica el alcance de guardar y presenta el estado vacío", async () => {
    const view = await render(<SavedEventsPanel onClose={jest.fn()} />);

    expect(view.getByText("Seguimiento, no reservación")).toBeTruthy();
    expect(view.getByText("Aún no guardas eventos")).toBeTruthy();
  });

  it("mantiene centrada una colección de una sola tarjeta", async () => {
    mockedUseSavedEvents.mockReturnValue({
      savedEvents: [{ id: "saved-1", evento_id: "event-1", evento: {} }],
      isLoading: false,
      isRefreshing: false,
      error: null,
      refresh: jest.fn(),
    });
    const view = await render(<SavedEventsPanel onClose={jest.fn()} />);

    expect(view.getByText("Tarjeta centrada")).toBeTruthy();
  });
});
