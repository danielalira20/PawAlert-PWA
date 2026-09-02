import {
  formatNavigationAge,
  formatNavigationDistance,
  formatNavigationDuration,
} from "../utils/navigationPresentation";

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
});
