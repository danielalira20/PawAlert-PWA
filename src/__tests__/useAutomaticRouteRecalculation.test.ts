import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useAutomaticRouteRecalculation } from "../hooks/useAutomaticRouteRecalculation";
import type {
  NavigationGeometry,
  NavigationOrigin,
} from "../types/navigation";

const geometry: NavigationGeometry = {
  type: "LineString",
  coordinates: [
    [-98.2, 19.04],
    [-98.19, 19.04],
  ],
};

function origin(
  sequence: number,
  latitude = 19.042,
  accuracyMeters = 10,
): NavigationOrigin {
  return {
    source: "device_gps",
    latitude,
    longitude: -98.195,
    accuracy_meters: accuracyMeters,
    captured_at: `2026-09-02T12:00:${String(sequence).padStart(2, "0")}.000Z`,
  };
}

describe("useAutomaticRouteRecalculation", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("exige tres lecturas y respeta el intervalo antes del recálculo", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(0);
    let finishRecalculation: (() => void) | null = null;
    const onRecalculate = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRecalculation = resolve;
        }),
    );
    const baseProps = {
      enabled: true,
      geometry,
      routeOrigin: origin(0, 19.04),
      routeCalculatedAt: "2026-09-02T12:00:00.000Z",
      routeExpiresAt: "2026-09-02T12:02:00.000Z",
      isRefreshing: false,
      onRecalculate,
    };
    const { result, rerender } = await renderHook(
      ({ currentOrigin }: { currentOrigin: NavigationOrigin }) =>
        useAutomaticRouteRecalculation({
          ...baseProps,
          origin: currentOrigin,
        }),
      { initialProps: { currentOrigin: origin(0, 19.04) } },
    );

    now.mockReturnValue(20_000);
    await rerender({ currentOrigin: origin(1) });
    await rerender({ currentOrigin: origin(2) });
    await rerender({ currentOrigin: origin(3) });
    expect(result.current.state).toBe("off_route");
    expect(onRecalculate).not.toHaveBeenCalled();

    now.mockReturnValue(36_000);
    await rerender({ currentOrigin: origin(4) });
    await waitFor(() => expect(onRecalculate).toHaveBeenCalledTimes(1));
    expect(result.current.state).toBe("recalculating");

    await act(async () => {
      finishRecalculation?.();
      await Promise.resolve();
    });
    expect(result.current.state).toBe("cooldown");

    now.mockReturnValue(70_000);
    await rerender({ currentOrigin: origin(5) });
    expect(result.current.state).toBe("cooldown");
    expect(onRecalculate).toHaveBeenCalledTimes(1);
  });

  it("ignora una lectura imprecisa aunque parezca estar fuera de ruta", async () => {
    const onRecalculate = jest.fn(() => Promise.resolve());
    const { result } = await renderHook(() =>
      useAutomaticRouteRecalculation({
        enabled: true,
        origin: origin(1, 19.05, 150),
        routeOrigin: origin(0, 19.04),
        geometry,
        routeCalculatedAt: "2026-09-02T12:00:00.000Z",
        routeExpiresAt: "2026-09-02T12:02:00.000Z",
        isRefreshing: false,
        onRecalculate,
      }),
    );

    expect(result.current.state).toBe("gps_imprecise");
    expect(result.current.distanceFromRouteMeters).toBeNull();
    expect(onRecalculate).not.toHaveBeenCalled();
  });

  it("renueva una ruta vencida después de avanzar más de 50 metros", async () => {
    jest.spyOn(Date, "now").mockReturnValue(200_000);
    const onRecalculate = jest.fn(() => new Promise<void>(() => undefined));
    const { result } = await renderHook(() =>
      useAutomaticRouteRecalculation({
        enabled: true,
        origin: origin(10, 19.0406),
        routeOrigin: origin(0, 19.04),
        geometry,
        routeCalculatedAt: "2026-09-02T12:00:00.000Z",
        routeExpiresAt: new Date(100_000).toISOString(),
        isRefreshing: false,
        onRecalculate,
      }),
    );

    await waitFor(() => expect(onRecalculate).toHaveBeenCalledTimes(1));
    expect(result.current.state).toBe("recalculating");
    expect(result.current.trigger).toBe("stale_route");
  });
});
