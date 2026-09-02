import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";

import { useAuth } from "../context/AuthContext";
import {
  calculateNavigationRoute,
  getNavigationCapabilities,
  NavigationApiError,
  navigationErrorMessage,
  normalizeNavigationApiError,
} from "../services/navigationService";
import { getFreshNavigationPosition } from "../services/navigationLocationService";
import {
  type ForegroundNavigationTrackingState,
  useForegroundNavigationTracking,
} from "./useForegroundNavigationTracking";
import type {
  NavigationCapabilities,
  NavigationDestination,
  NavigationErrorCode,
  NavigationMode,
  NavigationOrigin,
  NavigationRouteComplete,
  NavigationRouteResponse,
} from "../types/navigation";

export type NavigationPermissionState =
  "idle" | "requesting" | "granted" | "denied" | "error";

export interface CaseNavigationError {
  code:
    | NavigationErrorCode
    | "gps_denied"
    | "gps_unavailable"
    | "network_unavailable"
    | null;
  message: string;
  retryable: boolean;
  retryAfterSeconds: number | null;
}

export interface UseCaseNavigationResult {
  capabilities: NavigationCapabilities | null;
  currentRoute: NavigationRouteComplete | null;
  latestResult: NavigationRouteResponse | null;
  currentOrigin: NavigationOrigin | null;
  liveOrigin: NavigationOrigin | null;
  destination: NavigationDestination | null;
  mode: NavigationMode;
  permissionState: NavigationPermissionState;
  trackingState: ForegroundNavigationTrackingState;
  isLoadingCapabilities: boolean;
  isCalculating: boolean;
  isRefreshing: boolean;
  destinationChanged: boolean;
  accessRevoked: boolean;
  error: CaseNavigationError | null;
  setMode: (mode: NavigationMode) => Promise<void>;
  start: () => Promise<void>;
  recalculate: () => Promise<void>;
  retryCapabilities: () => Promise<void>;
  clearError: () => void;
}

function clientError(
  code: CaseNavigationError["code"],
  message: string,
  retryable: boolean,
): CaseNavigationError {
  return {
    code,
    message,
    retryable,
    retryAfterSeconds: null,
  };
}

function apiError(error: unknown): CaseNavigationError {
  const normalized = normalizeNavigationApiError(error);
  return {
    code:
      normalized.code ??
      (normalized.status === null ? "network_unavailable" : null),
    message: normalized.message,
    retryable: normalized.retryable,
    retryAfterSeconds: normalized.retryAfterSeconds,
  };
}

function isAccessRevoked(error: NavigationApiError): boolean {
  return (
    (error.status === 409 &&
      (error.code === "report_not_navigable" ||
        error.code === "navigation_access_revoked" ||
        error.code === "assignment_not_confirmed")) ||
    (error.status === 404 && error.code === "navigation_not_found")
  );
}

export function useCaseNavigation(
  reportId: string | null,
): UseCaseNavigationResult {
  const { token } = useAuth();
  const [capabilities, setCapabilities] =
    useState<NavigationCapabilities | null>(null);
  const [currentRoute, setCurrentRoute] =
    useState<NavigationRouteComplete | null>(null);
  const [latestResult, setLatestResult] =
    useState<NavigationRouteResponse | null>(null);
  const [mode, setModeState] = useState<NavigationMode>("driving");
  const [permissionState, setPermissionState] =
    useState<NavigationPermissionState>("idle");
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [accessRevoked, setAccessRevoked] = useState(false);
  const [error, setError] = useState<CaseNavigationError | null>(null);
  const capabilityRequestRef = useRef(0);
  const routeRequestRef = useRef(0);
  const tracking = useForegroundNavigationTracking(
    Boolean(
      currentRoute &&
        capabilities?.foreground_tracking &&
        permissionState === "granted" &&
        !accessRevoked,
    ),
  );
  const liveOrigin: NavigationOrigin | null = tracking.position
    ? {
        source: "device_gps",
        latitude: tracking.position.latitude,
        longitude: tracking.position.longitude,
        accuracy_meters: tracking.position.accuracyMeters,
        captured_at: tracking.position.capturedAt,
      }
    : null;

  const loadCapabilities = useCallback(async () => {
    const requestId = ++capabilityRequestRef.current;
    if (!reportId || !token) {
      setCapabilities(null);
      setIsLoadingCapabilities(false);
      return;
    }

    setIsLoadingCapabilities(true);
    setError(null);
    try {
      const response = await getNavigationCapabilities(token, reportId);
      if (requestId !== capabilityRequestRef.current) return;
      setCapabilities(response);
      setAccessRevoked(false);
      setModeState((currentMode) =>
        response.available_modes.includes(currentMode)
          ? currentMode
          : (response.available_modes[0] ?? "driving"),
      );
    } catch (requestError) {
      if (requestId !== capabilityRequestRef.current) return;
      const normalized = normalizeNavigationApiError(requestError);
      if (isAccessRevoked(normalized)) {
        setCurrentRoute(null);
        setLatestResult(null);
        setAccessRevoked(true);
      }
      setError(apiError(normalized));
    } finally {
      if (requestId === capabilityRequestRef.current) {
        setIsLoadingCapabilities(false);
      }
    }
  }, [reportId, token]);

  useEffect(() => {
    setCapabilities(null);
    setCurrentRoute(null);
    setLatestResult(null);
    setPermissionState("idle");
    setAccessRevoked(false);
    setError(null);
    void loadCapabilities();
    return () => {
      capabilityRequestRef.current += 1;
      routeRequestRef.current += 1;
    };
  }, [loadCapabilities]);

  const calculateForMode = useCallback(async (
    requestedMode: NavigationMode,
  ): Promise<boolean> => {
    if (!reportId || !token) {
      setError(clientError(null, "Inicia sesión para abrir la ruta.", false));
      return false;
    }
    if (!capabilities?.navigation_enabled) {
      setError(
        clientError(
          null,
          "La navegación no está disponible para este caso.",
          false,
        ),
      );
      return false;
    }
    if (!capabilities.available_modes.includes(requestedMode)) {
      setError(
        clientError(
          "mode_unavailable",
          navigationErrorMessage("mode_unavailable"),
          false,
        ),
      );
      return false;
    }

    const requestId = ++routeRequestRef.current;
    const refreshing = currentRoute !== null;
    setIsCalculating(!refreshing);
    setIsRefreshing(refreshing);
    setPermissionState("requesting");
    setError(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (requestId !== routeRequestRef.current) return false;
      if (permission.status !== "granted") {
        setPermissionState("denied");
        setError(
          clientError(
            "gps_denied",
            "Activa el permiso de ubicación para calcular la ruta desde donde estás.",
            true,
          ),
        );
        return false;
      }

      setPermissionState("granted");
      const position = await getFreshNavigationPosition();
      if (requestId !== routeRequestRef.current) return false;

      const response = await calculateNavigationRoute(token, reportId, {
        origin: {
          latitude: position.latitude,
          longitude: position.longitude,
          accuracy_meters: position.accuracyMeters,
          captured_at: position.capturedAt,
        },
        mode: requestedMode,
        ...(latestResult?.destination.revision
          ? { known_destination_revision: latestResult.destination.revision }
          : {}),
      });
      if (requestId !== routeRequestRef.current) return false;

      setLatestResult(response);
      setAccessRevoked(false);
      if (response.status === "complete") {
        setCurrentRoute(response);
        setError(null);
        return true;
      } else {
        setError({
          code: response.error_code,
          message: navigationErrorMessage(response.error_code),
          retryable: response.retryable,
          retryAfterSeconds: null,
        });
        return false;
      }
    } catch (requestError) {
      if (requestId !== routeRequestRef.current) return false;
      if (
        requestError instanceof Error &&
        !(requestError instanceof NavigationApiError)
      ) {
        setPermissionState("error");
        setError(
          clientError(
            "gps_unavailable",
            "No pudimos obtener tu ubicación. Revisa el GPS e intenta nuevamente.",
            true,
          ),
        );
        return false;
      }
      const normalized = normalizeNavigationApiError(requestError);
      if (isAccessRevoked(normalized)) {
        setCurrentRoute(null);
        setLatestResult(null);
        setAccessRevoked(true);
      }
      setError(apiError(normalized));
      return false;
    } finally {
      if (requestId === routeRequestRef.current) {
        setIsCalculating(false);
        setIsRefreshing(false);
      }
    }
  }, [capabilities, currentRoute, latestResult, reportId, token]);

  const calculate = useCallback(
    async () => {
      await calculateForMode(mode);
    },
    [calculateForMode, mode],
  );

  const setMode = useCallback(
    async (nextMode: NavigationMode) => {
      if (
        !capabilities?.available_modes.includes(nextMode) ||
        nextMode === mode ||
        isCalculating ||
        isRefreshing
      ) {
        return;
      }

      const previousMode = mode;
      setModeState(nextMode);
      const changed = await calculateForMode(nextMode);
      if (!changed) setModeState(previousMode);
    },
    [
      calculateForMode,
      capabilities,
      isCalculating,
      isRefreshing,
      mode,
    ],
  );

  return {
    capabilities,
    currentRoute,
    latestResult,
    currentOrigin: latestResult?.origin ?? null,
    liveOrigin,
    destination: latestResult?.destination ?? null,
    mode,
    permissionState,
    trackingState: tracking.state,
    isLoadingCapabilities,
    isCalculating,
    isRefreshing,
    destinationChanged:
      latestResult?.warnings.includes("destination_changed") ?? false,
    accessRevoked,
    error,
    setMode,
    start: calculate,
    recalculate: calculate,
    retryCapabilities: loadCapabilities,
    clearError: () => setError(null),
  };
}
