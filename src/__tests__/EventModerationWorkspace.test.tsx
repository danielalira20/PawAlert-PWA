import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { EventModerationWorkspace } from "../components/events/admin/EventModerationWorkspace";
import { listAdminEventIncidents } from "../services/eventService";

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ token: "token-admin" }),
}));

jest.mock("../services/eventService", () => ({
  listAdminEventIncidents: jest.fn(),
}));

jest.mock("../components/admin-dashboard/ReportModerationPanel", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    ReportModerationPanel: ({
      onCountChange,
    }: {
      onCountChange: (count: number) => void;
    }) => {
      React.useEffect(() => onCountChange(2), [onCountChange]);
      return <Text>Panel de reportes</Text>;
    },
  };
});

jest.mock("../components/events/admin/EventModerationPanel", () => {
  const { Text } = require("react-native");
  return {
    EventModerationPanel: () => <Text>Panel de eventos</Text>,
  };
});

const mockedListIncidents = listAdminEventIncidents as jest.MockedFunction<
  typeof listAdminEventIncidents
>;

describe("EventModerationWorkspace", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedListIncidents.mockImplementation(async (_, filters) => ({
      items: [],
      pagina: 1,
      limite: 1,
      total: filters.estado === "pendiente" ? 3 : 1,
      tiene_mas: false,
    }));
  });

  it("conserva reportes y agrega la bandeja de eventos en el mismo espacio", async () => {
    const onCountChange = jest.fn();
    const view = await render(
      <EventModerationWorkspace
        onCountChange={onCountChange}
        showToast={jest.fn()}
      />,
    );

    expect(view.getByText("Panel de reportes")).toBeTruthy();
    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(7));

    await fireEvent.press(view.getByText("Eventos"));

    expect(view.getByText("Panel de eventos")).toBeTruthy();
    expect(view.queryByText("Panel de reportes")).toBeNull();
    expect(mockedListIncidents).toHaveBeenCalledTimes(3);
  });
});
