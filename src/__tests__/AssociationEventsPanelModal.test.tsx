import { fireEvent, render } from "@testing-library/react-native";

import { AssociationEventsPanel } from "../components/events/association/AssociationEventsPanel";

const mockRefresh = jest.fn().mockResolvedValue(undefined);

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }), {
  virtual: true,
});

jest.mock("expo-router", () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock("../hooks/events/useAssociationEvents", () => ({
  useAssociationEvents: () => ({
    events: [{ id: "event-1", estado: "borrador" }],
    isLoading: false,
    isRefreshing: false,
    error: null,
    refresh: mockRefresh,
  }),
}));

jest.mock("../components/Toast", () => ({
  Toast: () => null,
  useToast: () => ({
    toast: null,
    translateY: null,
    showToast: jest.fn(),
  }),
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
        <View accessibilityLabel="Editor modal">{children}</View>
      ) : null,
  };
});

jest.mock(
  "../components/events/association/AssociationEventFilters",
  () => ({ AssociationEventFilters: () => null }),
);

jest.mock("../components/events/association/AssociationEventCard", () => {
  const { Text, TouchableOpacity } = require("react-native");
  return {
    AssociationEventCard: ({
      event,
      onManage,
    }: {
      event: { id: string };
      onManage: (eventId: string) => void;
    }) => (
      <TouchableOpacity onPress={() => onManage(event.id)}>
        <Text>Editar evento de prueba</Text>
      </TouchableOpacity>
    ),
  };
});

jest.mock("../screens/events/EventEditorScreen", () => {
  const { Text, TouchableOpacity, View } = require("react-native");
  return {
    __esModule: true,
    default: ({
      eventId,
      onClose,
      presentation,
    }: {
      eventId?: string;
      onClose: () => void;
      presentation: string;
    }) => (
      <View>
        <Text>{eventId ? `Editor ${eventId}` : "Editor nuevo"}</Text>
        <Text>{presentation}</Text>
        <TouchableOpacity onPress={onClose}>
          <Text>Cerrar editor</Text>
        </TouchableOpacity>
      </View>
    ),
  };
});

describe("AssociationEventsPanel modal", () => {
  beforeEach(() => mockRefresh.mockClear());

  it("abre la creación dentro de un modal y refresca al cerrarlo", () => {
    const view = render(<AssociationEventsPanel />);

    fireEvent.press(view.getByText("Nuevo evento"));

    expect(view.getByLabelText("Editor modal")).toBeTruthy();
    expect(view.getByText("Editor nuevo")).toBeTruthy();
    expect(view.getByText("modal")).toBeTruthy();

    fireEvent.press(view.getByText("Cerrar editor"));

    expect(view.queryByLabelText("Editor modal")).toBeNull();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("abre la edición del evento seleccionado en el mismo modal", () => {
    const view = render(<AssociationEventsPanel />);

    fireEvent.press(view.getByText("Editar evento de prueba"));

    expect(view.getByText("Editor event-1")).toBeTruthy();
    expect(view.getByText("modal")).toBeTruthy();
  });
});
