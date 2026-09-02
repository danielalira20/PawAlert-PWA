import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as Location from "expo-location";

import { useCaseNavigation } from "../hooks/useCaseNavigation";
import { useForegroundNavigationTracking } from "../hooks/useForegroundNavigationTracking";
import {
  calculateNavigationRoute,
  getNavigationCapabilities,
  NavigationApiError,
} from "../services/navigationService";
import type {
  NavigationCapabilities,
  NavigationErrorCode,
  NavigationRouteComplete,
} from "../types/navigation";

jest.mock("expo-location", () => ({
  Accuracy: { High: 6 },
  PermissionStatus: { GRANTED: "granted", DENIED: "denied" },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ token: "token-voluntario" }),
}));

jest.mock("../hooks/useForegroundNavigationTracking", () => ({
  useForegroundNavigationTracking: jest.fn(),
}));

jest.mock("../services/navigationService", () => {
  const actual = jest.requireActual("../services/navigationService");
  return {
    ...actual,
    getNavigationCapabilities: jest.fn(),
    calculateNavigationRoute: jest.fn(),
  };
});

const mockedLocation = Location as jest.Mocked<typeof Location>;
const mockedGetCapabilities = getNavigationCapabilities as jest.Mock;
const mockedCalculateRoute = calculateNavigationRoute as jest.Mock;
const mockedForegroundTracking = useForegroundNavigationTracking as jest.Mock;

const capabilities: NavigationCapabilities = {
  contract_version: 1,
  navigation_enabled: true,
  available_modes: ["driving"],
  destination_revision: "sighting:sighting-1",
  foreground_tracking: true,
  background_tracking: false,
  voice_guidance: false,
  live_traffic: false,
};

const completeRoute: NavigationRouteComplete = {
  contract_version: 1,
  status: "complete",
  report_id: "report-1",
  mode: "driving",
  available_modes: ["driving"],
  origin: {
    source: "device_gps",
    latitude: 19.03,
    longitude: -98.19,
    accuracy_meters: 12,
    captured_at: "2026-09-01T18:30:00.000Z",
  },
  destination: {
    source: "validated_sighting",
    latitude: 19.06,
    longitude: -98.22,
    confirmed_at: "2026-09-01T18:27:00.000Z",
    revision: "sighting:sighting-1",
  },
  route: {
    duration_seconds: 725,
    distance_meters: 5400,
    geometry: {
      type: "LineString",
      coordinates: [
        [-98.19, 19.03],
        [-98.22, 19.06],
      ],
    },
    steps: [],
  },
  calculated_at: "2026-09-01T18:30:01.000Z",
  expires_at: "2026-09-01T18:32:01.000Z",
  source: "osrm",
  warnings: [],
  error_code: null,
  retryable: null,
};

describe("useCaseNavigation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedForegroundTracking.mockReturnValue({ position: null, state: "idle" });
    mockedGetCapabilities.mockResolvedValue(capabilities);
    mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue({
      status: Location.PermissionStatus.GRANTED,
      granted: true,
      canAskAgain: true,
      expires: "never",
    });
    mockedLocation.getCurrentPositionAsync.mockResolvedValue({
      coords: {
        latitude: 19.03,
        longitude: -98.19,
        altitude: null,
        accuracy: 12,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.parse("2026-09-01T18:30:00.000Z"),
    });
    mockedCalculateRoute.mockResolvedValue(completeRoute);
  });

  it("consulta capacidades sin activar el GPS automáticamente", async () => {
    const { result } = await renderHook(() => useCaseNavigation("report-1"));

    await waitFor(() =>
      expect(result.current.capabilities).toEqual(capabilities),
    );
    expect(mockedGetCapabilities).toHaveBeenCalledWith(
      "token-voluntario",
      "report-1",
    );
    expect(
      mockedLocation.requestForegroundPermissionsAsync,
    ).not.toHaveBeenCalled();
  });

  it("explica el permiso denegado sin solicitar una ruta", async () => {
    mockedLocation.requestForegroundPermissionsAsync.mockResolvedValueOnce({
      status: Location.PermissionStatus.DENIED,
      granted: false,
      canAskAgain: true,
      expires: "never",
    });
    const { result } = await renderHook(() => useCaseNavigation("report-1"));
    await waitFor(() => expect(result.current.capabilities).not.toBeNull());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.permissionState).toBe("denied");
    expect(result.current.error?.code).toBe("gps_denied");
    expect(mockedCalculateRoute).not.toHaveBeenCalled();
  });

  it("calcula con una lectura GPS puntual y conserva la revisión", async () => {
    const { result } = await renderHook(() => useCaseNavigation("report-1"));
    await waitFor(() => expect(result.current.capabilities).not.toBeNull());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.currentRoute).toEqual(completeRoute);
    expect(result.current.permissionState).toBe("granted");
    expect(mockedCalculateRoute).toHaveBeenCalledWith(
      "token-voluntario",
      "report-1",
      {
        origin: {
          latitude: 19.03,
          longitude: -98.19,
          accuracy_meters: 12,
          captured_at: "2026-09-01T18:30:00.000Z",
        },
        mode: "driving",
      },
    );
  });

  it("expone la lectura en vivo sin solicitar otra ruta", async () => {
    mockedForegroundTracking.mockReturnValue({
      position: {
        latitude: 19.031,
        longitude: -98.191,
        accuracyMeters: 8,
        capturedAt: "2026-09-02T12:00:00.000Z",
      },
      state: "active",
    });
    const { result } = await renderHook(() => useCaseNavigation("report-1"));
    await waitFor(() => expect(result.current.capabilities).not.toBeNull());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.liveOrigin).toEqual({
      source: "device_gps",
      latitude: 19.031,
      longitude: -98.191,
      accuracy_meters: 8,
      captured_at: "2026-09-02T12:00:00.000Z",
    });
    expect(result.current.trackingState).toBe("active");
    expect(mockedCalculateRoute).toHaveBeenCalledTimes(1);
  });

  it("conserva la última ruta válida cuando falla un recálculo", async () => {
    const { result } = await renderHook(() => useCaseNavigation("report-1"));
    await waitFor(() => expect(result.current.capabilities).not.toBeNull());
    await act(async () => {
      await result.current.start();
    });
    mockedCalculateRoute.mockRejectedValueOnce(
      new NavigationApiError("No pudimos calcular la ruta.", {
        status: 503,
        code: "provider_error",
        retryable: true,
      }),
    );

    await act(async () => {
      await result.current.recalculate();
    });

    expect(result.current.currentRoute).toEqual(completeRoute);
    expect(result.current.error?.code).toBe("provider_error");
    expect(result.current.error?.retryable).toBe(true);
  });

  it("distingue una caída de red y conserva la ruta anterior", async () => {
    const { result } = await renderHook(() => useCaseNavigation("report-1"));
    await waitFor(() => expect(result.current.capabilities).not.toBeNull());
    await act(async () => {
      await result.current.start();
    });
    mockedCalculateRoute.mockRejectedValueOnce(
      new NavigationApiError("Revisa tu conexión.", {
        status: null,
        retryable: true,
      }),
    );

    await act(async () => {
      await result.current.recalculate();
    });

    expect(result.current.currentRoute).toEqual(completeRoute);
    expect(result.current.error?.code).toBe("network_unavailable");
    expect(result.current.error?.retryable).toBe(true);
  });

  it("retira la ruta cuando el backend revoca el acceso", async () => {
    const { result } = await renderHook(() => useCaseNavigation("report-1"));
    await waitFor(() => expect(result.current.capabilities).not.toBeNull());
    await act(async () => {
      await result.current.start();
    });
    mockedCalculateRoute.mockRejectedValueOnce(
      new NavigationApiError("El caso ya no es navegable.", {
        status: 409,
        code: "report_not_navigable",
        retryable: false,
      }),
    );

    await act(async () => {
      await result.current.recalculate();
    });

    expect(result.current.currentRoute).toBeNull();
    expect(result.current.accessRevoked).toBe(true);
    expect(result.current.error?.code).toBe("report_not_navigable");
  });

  it.each<[number, NavigationErrorCode]>([
    [409, "assignment_not_confirmed"],
    [404, "navigation_not_found"],
  ])(
    "retira una ruta abierta al revalidar el acceso (%s %s)",
    async (status, code) => {
      const { result } = await renderHook(() => useCaseNavigation("report-1"));
      await waitFor(() => expect(result.current.capabilities).not.toBeNull());
      await act(async () => {
        await result.current.start();
      });
      mockedGetCapabilities.mockRejectedValueOnce(
        new NavigationApiError("La asignación ya no está disponible.", {
          status,
          code,
          retryable: false,
        }),
      );

      await act(async () => {
        await result.current.retryCapabilities();
      });

      expect(result.current.currentRoute).toBeNull();
      expect(result.current.accessRevoked).toBe(true);
      expect(result.current.error?.code).toBe(code);
    },
  );
});
