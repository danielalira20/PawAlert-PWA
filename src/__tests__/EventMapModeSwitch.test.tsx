import { fireEvent, render } from "@testing-library/react-native";

import { EventMapModeSwitch } from "../components/events/discovery/EventMapModeSwitch";

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }), {
  virtual: true,
});

describe("EventMapModeSwitch", () => {
  it("no muestra Lista | Mapa mientras el usuario explora rescates", async () => {
    const view = await render(
      <EventMapModeSwitch
        contentMode="rescues"
        eventView="list"
        showEventView
        onContentModeChange={jest.fn()}
        onEventViewChange={jest.fn()}
      />,
    );

    expect(view.getByText("Rescates")).toBeTruthy();
    expect(view.getByText("Eventos")).toBeTruthy();
    expect(view.queryByText("Lista")).toBeNull();
    expect(view.queryByText("Mapa")).toBeNull();
  });

  it("habilita Lista | Mapa solo dentro del modo Eventos", async () => {
    const onEventViewChange = jest.fn();
    const view = await render(
      <EventMapModeSwitch
        contentMode="events"
        eventView="list"
        showEventView
        onContentModeChange={jest.fn()}
        onEventViewChange={onEventViewChange}
      />,
    );

    await fireEvent.press(view.getByText("Mapa"));

    expect(view.getByText("Lista")).toBeTruthy();
    expect(onEventViewChange).toHaveBeenCalledWith("map");
  });
});
