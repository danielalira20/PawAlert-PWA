import {
  getFreshWebNavigationPosition,
  watchWebNavigationPosition,
} from "../services/navigationLocationService";

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

  it("observa ubicaciones web y permite detener el seguimiento", async () => {
    const clearWatch = jest.fn();
    const watchPosition = jest.fn(
      (
        success: PositionCallback,
        _error?: PositionErrorCallback,
        _options?: PositionOptions,
      ) => {
        success({
          coords: {
            accuracy: 9,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            latitude: 19.031,
            longitude: -98.191,
            speed: null,
            toJSON: () => ({}),
          },
          timestamp: Date.parse("2026-09-02T12:00:00.000Z"),
          toJSON: () => ({}),
        });
        return 17;
      },
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { clearWatch, watchPosition },
    });
    const onPosition = jest.fn();

    const stop = watchWebNavigationPosition(onPosition);

    expect(onPosition).toHaveBeenCalledWith({
      latitude: 19.031,
      longitude: -98.191,
      accuracyMeters: 9,
      capturedAt: "2026-09-02T12:00:00.000Z",
    });
    expect(watchPosition).toHaveBeenCalledWith(
      expect.any(Function),
      undefined,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15_000,
      },
    );

    stop();
    expect(clearWatch).toHaveBeenCalledWith(17);
  });
});
