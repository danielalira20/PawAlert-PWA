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
  code: NavigationErrorCode | "gps_denied" | "gps_unavailable" | null;
  message: string;
  retryable: boolean;
  retryAfterSeconds: number | null;
}

export interface UseCaseNavigationResult {
  capabilities: NavigationCapabilities | null;
  currentRoute: NavigationRouteComplete | null;
  latestResult: NavigationRouteResponse | null;
  currentOrigin: NavigationOrigin | null;
  destination: NavigationDestination | null;
  mode: NavigationMode;
  permissionState: NavigationPermissionState;
  isLoadingCapabilities: boolean;
  isCalculating: boolean;
  isRefreshing: boolean;
  destinationChanged: boolean;
  accessRevoked: boolean;
  error: CaseNavigationError | null;
  setMode: (mode: NavigationMode) => void;
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
    code: normalized.code,
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

  const calculate = useCallback(async () => {
    if (!reportId || !token) {
      setError(clientError(null, "Inicia sesión para abrir la ruta.", false));
      return;
    }
    if (!capabilities?.navigation_enabled) {
      setError(
        clientError(
          null,
          "La navegación no está disponible para este caso.",
          false,
        ),
      );
      return;
    }
    if (!capabilities.available_modes.includes(mode)) {
      setError(
        clientError(
          "mode_unavailable",
          navigationErrorMessage("mode_unavailable"),
          false,
        ),
      );
      return;
    }

    const requestId = ++routeRequestRef.current;
    const refreshing = currentRoute !== null;
    setIsCalculating(!refreshing);
    setIsRefreshing(refreshing);
    setPermissionState("requesting");
    setError(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (requestId !== routeRequestRef.current) return;
      if (permission.status !== "granted") {
        setPermissionState("denied");
        setError(
          clientError(
            "gps_denied",
            "Activa el permiso de ubicación para calcular la ruta desde donde estás.",
            true,
          ),
        );
        return;
      }

      setPermissionState("granted");
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      if (requestId !== routeRequestRef.current) return;

      const response = await calculateNavigationRoute(token, reportId, {
        origin: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_meters: position.coords.accuracy ?? null,
          captured_at: new Date(position.timestamp).toISOString(),
        },
        mode,
        ...(latestResult?.destination.revision
          ? { known_destination_revision: latestResult.destination.revision }
          : {}),
      });
      if (requestId !== routeRequestRef.current) return;

      setLatestResult(response);
      setAccessRevoked(false);
      if (response.status === "complete") {
        setCurrentRoute(response);
        setError(null);
      } else {
        setError({
          code: response.error_code,
          message: navigationErrorMessage(response.error_code),
          retryable: response.retryable,
          retryAfterSeconds: null,
        });
      }
    } catch (requestError) {
      if (requestId !== routeRequestRef.current) return;
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
        return;
      }
      const normalized = normalizeNavigationApiError(requestError);
      if (isAccessRevoked(normalized)) {
        setCurrentRoute(null);
        setLatestResult(null);
        setAccessRevoked(true);
      }
      setError(apiError(normalized));
    } finally {
      if (requestId === routeRequestRef.current) {
        setIsCalculating(false);
        setIsRefreshing(false);
      }
    }
  }, [capabilities, currentRoute, latestResult, mode, reportId, token]);

  const setMode = useCallback(
    (nextMode: NavigationMode) => {
      if (!capabilities?.available_modes.includes(nextMode)) return;
      setModeState(nextMode);
    },
    [capabilities],
  );

  return {
    capabilities,
    currentRoute,
    latestResult,
    currentOrigin: latestResult?.origin ?? null,
    destination: latestResult?.destination ?? null,
    mode,
    permissionState,
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
