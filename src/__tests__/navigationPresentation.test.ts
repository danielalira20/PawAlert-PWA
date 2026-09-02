import {
  advanceNavigationStepIndex,
  formatNavigationAge,
  formatNavigationDistance,
  formatNavigationDuration,
  formatNavigationInstruction,
  formatNavigationStepDistance,
  navigationDistanceBetweenMeters,
  navigationStepDistanceMeters,
} from "../utils/navigationPresentation";
import type { NavigationStep } from "../types/navigation";

function step(overrides: Partial<NavigationStep> = {}): NavigationStep {
  return {
    type: "turn",
    modifier: "right",
    street_name: "Avenida 11 Sur",
    distance_meters: 320,
    duration_seconds: 44,
    location: [-98.2081, 19.043],
    ...overrides,
  };
}

describe("navigationPresentation", () => {
  it("formats short and long route durations", () => {
    expect(formatNavigationDuration(20)).toBe("1 min");
    expect(formatNavigationDuration(1500)).toBe("25 min");
    expect(formatNavigationDuration(4200)).toBe("1 h 10 min");
  });

  it("formats meters and kilometers without overstating precision", () => {
    expect(formatNavigationDistance(850)).toBe("850 m");
    expect(formatNavigationDistance(3120)).toBe("3.1 km");
  });

  it("handles unavailable route timestamps", () => {
    expect(formatNavigationAge(null)).toBe("sin hora disponible");
    expect(formatNavigationAge("not-a-date")).toBe("sin hora disponible");
  });

  it("translates known OSRM maneuvers with their street", () => {
    expect(formatNavigationInstruction(step())).toBe(
      "Gira a la derecha en Avenida 11 Sur",
    );
    expect(
      formatNavigationInstruction(
        step({ type: "fork", modifier: "slight left", street_name: null }),
      ),
    ).toBe("Mantente ligeramente a la izquierda");
    expect(formatNavigationInstruction(step({ type: "arrive" }))).toBe(
      "Llegaste al destino",
    );
  });

  it("uses a safe generic instruction for unknown maneuver values", () => {
    expect(
      formatNavigationInstruction(
        step({ type: "future-provider-value", modifier: null }),
      ),
    ).toBe("Continúa siguiendo la ruta en Avenida 11 Sur");
  });

  it("formats the maneuver distance without false precision", () => {
    expect(formatNavigationStepDistance(step())).toBe("En 320 m");
    expect(
      formatNavigationStepDistance(
        step({ type: "depart", distance_meters: 900 }),
      ),
    ).toBe("Ahora");
  });

  it("advances maneuvers only after reaching them and never moves backward", () => {
    const steps = [
      step({ type: "depart", location: [-98.19, 19.03] }),
      step({ type: "turn", location: [-98.191, 19.031] }),
      step({ type: "arrive", location: [-98.2, 19.04] }),
    ];

    expect(
      advanceNavigationStepIndex(
        steps,
        { latitude: 19.03, longitude: -98.19 },
        0,
      ),
    ).toBe(1);
    expect(
      advanceNavigationStepIndex(
        steps,
        { latitude: 19.03, longitude: -98.19 },
        1,
      ),
    ).toBe(1);
  });

  it("calculates live distance to an OSRM maneuver", () => {
    const meters = navigationStepDistanceMeters(
      step({ location: [-98.19, 19.031] }),
      { latitude: 19.03, longitude: -98.19 },
    );

    expect(meters).toBeCloseTo(111, 0);
    expect(
      navigationDistanceBetweenMeters(
        { latitude: 19.03, longitude: -98.19 },
        { latitude: 19.03, longitude: -98.19 },
      ),
    ).toBe(0);
  });

  it("does not announce arrival before reaching the destination", () => {
    const arrive = step({ type: "arrive" });
    expect(formatNavigationInstruction(arrive, 500)).toBe(
      "Continúa hasta el destino",
    );
    expect(formatNavigationStepDistance(arrive, 500)).toBe("En 500 m");
  });
});
