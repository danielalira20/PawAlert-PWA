import axios from "axios";

import { API_URL } from "../constants/api";
import type {
  NavigationCapabilities,
  NavigationErrorCode,
  NavigationRouteRequest,
  NavigationRouteResponse,
} from "../types/navigation";

interface NavigationErrorDetail {
  code?: unknown;
  message?: unknown;
}

export class NavigationApiError extends Error {
  readonly status: number | null;
  readonly code: NavigationErrorCode | null;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    options: {
      status?: number | null;
      code?: NavigationErrorCode | null;
      retryable?: boolean;
      retryAfterSeconds?: number | null;
    } = {},
  ) {
    super(message);
    this.name = "NavigationApiError";
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    this.retryable = options.retryable ?? false;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

function authHeaders(token: string) {
  if (!token.trim()) {
    throw new NavigationApiError("Inicia sesión para abrir la ruta.", {
      status: 401,
    });
  }
  return { Authorization: `Bearer ${token}` };
}

function isNavigationErrorCode(value: unknown): value is NavigationErrorCode {
  return (
    typeof value === "string" &&
    [
      "assignment_not_confirmed",
      "report_not_navigable",
      "navigation_access_revoked",
      "navigation_not_found",
      "invalid_origin",
      "stale_origin",
      "low_accuracy_origin",
      "mode_unavailable",
      "provider_timeout",
      "provider_error",
      "no_route",
      "recalculation_rate_limited",
    ].includes(value)
  );
}

const RETRYABLE_VALIDATION_CODES = new Set<NavigationErrorCode>([
  "invalid_origin",
  "stale_origin",
  "low_accuracy_origin",
]);

export function navigationErrorMessage(
  code: NavigationErrorCode | null,
  fallback?: string,
): string {
  const messages: Partial<Record<NavigationErrorCode, string>> = {
    assignment_not_confirmed:
      "Confirma la asignación antes de abrir la navegación.",
    report_not_navigable: "Este caso ya no necesita una ruta operativa.",
    navigation_access_revoked:
      "La ruta dejó de estar disponible para esta asignación.",
    navigation_not_found: "No encontramos una ruta asignada para este caso.",
    invalid_origin: "No pudimos validar tu ubicación actual.",
    stale_origin: "La ubicación es antigua. Obtén una lectura nueva.",
    low_accuracy_origin: "La señal GPS todavía no tiene precisión suficiente.",
    mode_unavailable: "Ese modo de traslado no está disponible.",
    provider_timeout:
      "El cálculo está tardando más de lo esperado. Puedes reintentar.",
    provider_error:
      "No pudimos calcular la ruta en este momento. Puedes reintentar.",
    no_route: "No encontramos una ruta vial entre tu ubicación y el destino.",
    recalculation_rate_limited:
      "Espera un momento antes de volver a calcular la ruta.",
  };
  return (
    (code && messages[code]) ||
    fallback ||
    "No pudimos actualizar la navegación."
  );
}

function retryAfterSeconds(headers: unknown): number | null {
  if (!headers || typeof headers !== "object") return null;
  const headerGetter = (headers as { get?: (name: string) => unknown }).get;
  const value =
    typeof headerGetter === "function"
      ? headerGetter.call(headers, "retry-after")
      : (headers as Record<string, unknown>)["retry-after"];
  const seconds = typeof value === "string" ? Number(value) : value;
  return typeof seconds === "number" && Number.isFinite(seconds)
    ? seconds
    : null;
}

export function normalizeNavigationApiError(
  error: unknown,
): NavigationApiError {
  if (error instanceof NavigationApiError) return error;
  if (!axios.isAxiosError(error)) {
    return new NavigationApiError(
      "No pudimos actualizar la navegación. Revisa tu conexión.",
      { retryable: true },
    );
  }

  const status = error.response?.status ?? null;
  const detail = error.response?.data?.detail;
  const structuredDetail =
    detail && typeof detail === "object" && !Array.isArray(detail)
      ? (detail as NavigationErrorDetail)
      : null;
  const code = isNavigationErrorCode(structuredDetail?.code)
    ? structuredDetail.code
    : null;
  const backendMessage =
    typeof structuredDetail?.message === "string"
      ? structuredDetail.message
      : typeof detail === "string"
        ? detail
        : undefined;
  const retryable =
    status === null ||
    status === 429 ||
    (status !== null && status >= 500) ||
    (code !== null && RETRYABLE_VALIDATION_CODES.has(code));

  return new NavigationApiError(
    navigationErrorMessage(
      code,
      status === 401
        ? "Tu sesión expiró. Inicia sesión nuevamente."
        : backendMessage,
    ),
    {
      status,
      code,
      retryable,
      retryAfterSeconds: retryAfterSeconds(error.response?.headers),
    },
  );
}

async function navigationRequest<T>(
  request: () => Promise<{ data: T }>,
): Promise<T> {
  try {
    return (await request()).data;
  } catch (error) {
    throw normalizeNavigationApiError(error);
  }
}

export function getNavigationCapabilities(
  token: string,
  reportId: string,
): Promise<NavigationCapabilities> {
  return navigationRequest(() =>
    axios.get<NavigationCapabilities>(
      `${API_URL}/voluntarios/me/reportes/${encodeURIComponent(reportId)}/navegacion/capabilities`,
      { headers: authHeaders(token) },
    ),
  );
}

export function calculateNavigationRoute(
  token: string,
  reportId: string,
  body: NavigationRouteRequest,
): Promise<NavigationRouteResponse> {
  return navigationRequest(() =>
    axios.post<NavigationRouteResponse>(
      `${API_URL}/voluntarios/me/reportes/${encodeURIComponent(reportId)}/navegacion/ruta`,
      body,
      { headers: authHeaders(token) },
    ),
  );
}
