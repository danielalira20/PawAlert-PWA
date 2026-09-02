import axios from "axios";

import { API_URL } from "../constants/api";
import {
  calculateNavigationRoute,
  getNavigationCapabilities,
  NavigationApiError,
  normalizeNavigationApiError,
} from "../services/navigationService";
import type { NavigationRouteRequest } from "../types/navigation";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("navigationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("consulta capacidades únicamente con autenticación", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        contract_version: 1,
        navigation_enabled: true,
        available_modes: ["driving"],
        destination_revision: "sighting:sighting-1",
        foreground_tracking: true,
        background_tracking: false,
        voice_guidance: false,
        live_traffic: false,
      },
    });

    await getNavigationCapabilities("token-voluntario", "reporte/1");

    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${API_URL}/voluntarios/me/reportes/reporte%2F1/navegacion/capabilities`,
      { headers: { Authorization: "Bearer token-voluntario" } },
    );
  });

  it("envía solo el origen GPS, el modo y la revisión conocida", async () => {
    const body: NavigationRouteRequest = {
      origin: {
        latitude: 19.0412,
        longitude: -98.2063,
        accuracy_meters: 18.4,
        captured_at: "2026-09-01T18:30:00.000Z",
      },
      mode: "driving",
      known_destination_revision: "sighting:anterior",
    };
    mockedAxios.post.mockResolvedValueOnce({ data: { status: "complete" } });

    await calculateNavigationRoute("token-voluntario", "report-1", body);

    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${API_URL}/voluntarios/me/reportes/report-1/navegacion/ruta`,
      body,
      { headers: { Authorization: "Bearer token-voluntario" } },
    );
    expect(body).not.toHaveProperty("destination");
  });

  it("rechaza un token vacío antes de llamar a la red", async () => {
    await expect(getNavigationCapabilities("   ", "report-1")).rejects.toEqual(
      expect.objectContaining({
        name: "NavigationApiError",
        status: 401,
      }),
    );
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it("normaliza el código de negocio y Retry-After", () => {
    mockedAxios.isAxiosError.mockReturnValueOnce(true);
    const normalized = normalizeNavigationApiError({
      response: {
        status: 429,
        data: {
          detail: {
            code: "recalculation_rate_limited",
            message: "Espera antes de recalcular.",
          },
        },
        headers: { "retry-after": "17" },
      },
    });

    expect(normalized).toBeInstanceOf(NavigationApiError);
    expect(normalized.code).toBe("recalculation_rate_limited");
    expect(normalized.retryable).toBe(true);
    expect(normalized.retryAfterSeconds).toBe(17);
    expect(normalized.message).toContain("Espera un momento");
  });

  it.each(["invalid_origin", "stale_origin", "low_accuracy_origin"] as const)(
    "permite repetir una lectura GPS rechazada por %s",
    (code) => {
      mockedAxios.isAxiosError.mockReturnValueOnce(true);

      const normalized = normalizeNavigationApiError({
        response: {
          status: 422,
          data: { detail: { code } },
        },
      });

      expect(normalized.code).toBe(code);
      expect(normalized.retryable).toBe(true);
    },
  );
});
