import { getFreshWebNavigationPosition } from "../services/navigationLocationService";

describe("navigationLocationService", () => {
  const originalGeolocation = navigator.geolocation;

  afterEach(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: originalGeolocation,
    });
  });

  it("exige una lectura nueva al navegador web", async () => {
    const getCurrentPosition = jest.fn(
      (
        success: PositionCallback,
        _error?: PositionErrorCallback,
        options?: PositionOptions,
      ) => {
        success({
          coords: {
            accuracy: 18,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            latitude: 19.03,
            longitude: -98.19,
            speed: null,
            toJSON: () => ({}),
          },
          timestamp: Date.parse("2026-09-01T23:50:00.000Z"),
          toJSON: () => ({}),
        });
      },
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    await expect(getFreshWebNavigationPosition()).resolves.toEqual({
      latitude: 19.03,
      longitude: -98.19,
      accuracyMeters: 18,
      capturedAt: "2026-09-01T23:50:00.000Z",
    });
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15_000,
      },
    );
  });
});
