import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react-native";
import { AppState } from "react-native";

import CaseNavigationScreen from "../screens/CaseNavigationScreen";
import { useAuth } from "../context/AuthContext";
import { useCaseNavigation } from "../hooks/useCaseNavigation";
import type { NavigationRouteComplete } from "../types/navigation";

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }), {
  virtual: true,
});

jest.mock("../components/navigation/CaseNavigationMap", () => ({
  __esModule: true,
  default: "CaseNavigationMap",
}));

jest.mock("../context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../hooks/useCaseNavigation", () => ({
  useCaseNavigation: jest.fn(),
}));

const mockedUseAuth = useAuth as jest.Mock;
const mockedUseCaseNavigation = useCaseNavigation as jest.Mock;
let handleAppStateChange: ((state: "active") => void) | null = null;

const route: NavigationRouteComplete = {
  contract_version: 1,
  status: "complete",
  report_id: "report-12345678",
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

describe("CaseNavigationScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({ isLoggedIn: true, isLoading: false });
    handleAppStateChange = null;
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, listener) => {
        handleAppStateChange = listener as (state: "active") => void;
        return { remove: jest.fn() };
      });
  });

  afterEach(async () => {
    await cleanup();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("presents the current route and delegates recalculation to the hook", async () => {
    const start = jest.fn(() => Promise.resolve());
    const recalculate = jest.fn(() => Promise.resolve());
    mockedUseCaseNavigation.mockReturnValue({
      capabilities: {
        contract_version: 1,
        navigation_enabled: true,
        available_modes: ["driving"],
        destination_revision: "sighting:sighting-1",
        foreground_tracking: true,
        background_tracking: false,
        voice_guidance: false,
        live_traffic: false,
      },
      currentRoute: route,
      currentOrigin: route.origin,
      destination: route.destination,
      permissionState: "granted",
      isLoadingCapabilities: false,
      isCalculating: false,
      isRefreshing: false,
      destinationChanged: false,
      accessRevoked: false,
      error: null,
      start,
      recalculate,
      retryCapabilities: jest.fn(() => Promise.resolve()),
      clearError: jest.fn(),
    });

    const view = await render(
      <CaseNavigationScreen reportId="report-12345678" onClose={jest.fn()} />,
    );

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(view.getByText("12 min")).toBeTruthy();
    expect(view.getByText("5.4 km")).toBeTruthy();
    expect(view.getByText("Última ubicación confirmada")).toBeTruthy();

    fireEvent.press(view.getByText("Recalcular"));
    expect(recalculate).toHaveBeenCalledTimes(1);
  });

  it("revalida periódicamente y al volver a primer plano", async () => {
    const retryCapabilities = jest.fn(() => Promise.resolve());
    const intervalSpy = jest.spyOn(global, "setInterval");
    mockedUseCaseNavigation.mockReturnValue({
      capabilities: {
        contract_version: 1,
        navigation_enabled: true,
        available_modes: ["driving"],
        destination_revision: "sighting:sighting-1",
        foreground_tracking: true,
        background_tracking: false,
        voice_guidance: false,
        live_traffic: false,
      },
      currentRoute: route,
      currentOrigin: route.origin,
      destination: route.destination,
      permissionState: "granted",
      isLoadingCapabilities: false,
      isCalculating: false,
      isRefreshing: false,
      destinationChanged: false,
      accessRevoked: false,
      error: null,
      start: jest.fn(() => Promise.resolve()),
      recalculate: jest.fn(() => Promise.resolve()),
      retryCapabilities,
      clearError: jest.fn(),
    });

    const view = await render(
      <CaseNavigationScreen reportId="report-12345678" onClose={jest.fn()} />,
    );

    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);
    await act(async () => {
      handleAppStateChange?.("active");
      await Promise.resolve();
    });

    expect(retryCapabilities).toHaveBeenCalledTimes(1);
    await view.unmount();
    intervalSpy.mockRestore();
  });

  it("recalcula una sola vez cuando detecta un avistamiento más reciente", async () => {
    const recalculate = jest.fn(() => Promise.resolve());
    mockedUseCaseNavigation.mockReturnValue({
      capabilities: {
        contract_version: 1,
        navigation_enabled: true,
        available_modes: ["driving"],
        destination_revision: "sighting:sighting-2",
        foreground_tracking: true,
        background_tracking: false,
        voice_guidance: false,
        live_traffic: false,
      },
      currentRoute: route,
      currentOrigin: route.origin,
      destination: route.destination,
      permissionState: "granted",
      isLoadingCapabilities: false,
      isCalculating: false,
      isRefreshing: false,
      destinationChanged: false,
      accessRevoked: false,
      error: null,
      start: jest.fn(() => Promise.resolve()),
      recalculate,
      retryCapabilities: jest.fn(() => Promise.resolve()),
      clearError: jest.fn(),
    });

    await render(
      <CaseNavigationScreen reportId="report-12345678" onClose={jest.fn()} />,
    );

    await waitFor(() => expect(recalculate).toHaveBeenCalledTimes(1));
  });

  it("ofrece mapas externos cuando OSRM no encuentra una ruta vial", async () => {
    mockedUseCaseNavigation.mockReturnValue({
      capabilities: {
        contract_version: 1,
        navigation_enabled: true,
        available_modes: ["driving"],
        destination_revision: "sighting:sighting-1",
        foreground_tracking: true,
        background_tracking: false,
        voice_guidance: false,
        live_traffic: false,
      },
      currentRoute: null,
      currentOrigin: route.origin,
      destination: route.destination,
      permissionState: "granted",
      isLoadingCapabilities: false,
      isCalculating: false,
      isRefreshing: false,
      destinationChanged: false,
      accessRevoked: false,
      error: {
        code: "no_route",
        message:
          "No encontramos una ruta vial entre tu ubicación y el destino.",
        retryable: false,
        retryAfterSeconds: null,
      },
      start: jest.fn(() => Promise.resolve()),
      recalculate: jest.fn(() => Promise.resolve()),
      retryCapabilities: jest.fn(() => Promise.resolve()),
      clearError: jest.fn(),
    });

    const view = await render(
      <CaseNavigationScreen reportId="report-12345678" onClose={jest.fn()} />,
    );

    expect(
      view.getByText("Tiempo y distancia vial no disponibles"),
    ).toBeTruthy();
    expect(view.getByText(/La línea punteada solo orienta/)).toBeTruthy();
    expect(view.getByText("Google Maps")).toBeTruthy();
    expect(view.getByText("Waze")).toBeTruthy();
  });
});
