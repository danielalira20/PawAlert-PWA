import {
  getEventLifecycleActions,
  getIncompleteEventSteps,
} from "../utils/eventLifecycle";

describe("eventLifecycle", () => {
  it("expone únicamente las transiciones permitidas por estado", () => {
    expect(getEventLifecycleActions("borrador")).toEqual(["publish"]);
    expect(getEventLifecycleActions("publicado")).toEqual([
      "pause",
      "cancel",
    ]);
    expect(getEventLifecycleActions("pausado")).toEqual([
      "publish",
      "cancel",
    ]);
    expect(getEventLifecycleActions("cancelado")).toEqual([]);
    expect(getEventLifecycleActions("suspendido_admin")).toEqual([]);
  });

  it("traduce el avance incompleto a secciones accionables", () => {
    expect(
      getIncompleteEventSteps([true, false, true, false, true]),
    ).toEqual(["Fecha y ubicación", "Organización"]);
  });
});
