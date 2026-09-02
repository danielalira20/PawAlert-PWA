import { expect, test, type Page, type Route } from "@playwright/test";

const REPORT_ID = "11111111-2222-4333-8444-555555555555";
const API_ORIGIN = "http://localhost:8000";
const TOKEN = "e2e-navigation-token";

const volunteer = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  nombre: "Valeria",
  apellido_paterno: "Prueba",
  email: "voluntaria.navegacion@example.test",
  telefono: "2220000000",
  rol: "voluntario",
  tiene_perfil_apoyo: true,
  tipo_perfil_apoyo: "voluntario_interno",
};

const destination = {
  source: "validated_sighting",
  latitude: 19.0474,
  longitude: -98.2582,
  confirmed_at: "2026-09-01T15:00:00.000Z",
  revision: "sighting:e2e-1",
};

const updatedDestination = {
  source: "validated_sighting",
  latitude: 19.052,
  longitude: -98.244,
  confirmed_at: "2026-09-02T15:00:00.000Z",
  revision: "sighting:e2e-2",
};

const capabilities = {
  contract_version: 1,
  navigation_enabled: true,
  available_modes: ["driving"],
  destination_revision: destination.revision,
  foreground_tracking: true,
  background_tracking: false,
  voice_guidance: false,
  live_traffic: false,
};

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "Authorization, Content-Type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "content-type": "application/json",
};

interface NavigationMockOptions {
  availableModes?: Array<"driving" | "cycling" | "walking">;
  noRoute?: boolean;
  revokeAfterInitialRoute?: boolean;
  revocationCode?: "navigation_not_found" | "report_not_navigable";
  failRecalculationWithNetworkError?: boolean;
  updateDestinationAfterInitialRoute?: boolean;
}

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    headers: corsHeaders,
    body: JSON.stringify(body),
  });
}

async function expectNavigationMapFitsViewport(page: Page) {
  const map = page.getByLabel("Mapa de navegación del caso");
  const viewport = page.viewportSize();
  await expect
    .poll(async () => {
      const mapBox = await map.boundingBox();
      if (!mapBox) return false;
      if (viewport && viewport.width < 900 && mapBox.height > 320) return false;

      for (const selector of [
        ".pawalert-navigation-origin",
        ".pawalert-navigation-destination",
      ]) {
        const markerBox = await page.locator(selector).boundingBox();
        if (!markerBox) return false;
        if (
          markerBox.x < mapBox.x ||
          markerBox.y < mapBox.y ||
          markerBox.x + markerBox.width > mapBox.x + mapBox.width ||
          markerBox.y + markerBox.height > mapBox.y + mapBox.height
        ) {
          return false;
        }
      }

      return true;
    })
    .toBe(true);

  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

async function expectOriginNearMapCenter(page: Page) {
  const map = page.getByLabel("Mapa de navegación del caso");
  const origin = page.locator(".pawalert-navigation-origin");

  await expect
    .poll(async () => {
      const mapBox = await map.boundingBox();
      const originBox = await origin.boundingBox();
      if (!mapBox || !originBox) return false;

      const mapCenter = {
        x: mapBox.x + mapBox.width / 2,
        y: mapBox.y + mapBox.height / 2,
      };
      const originCenter = {
        x: originBox.x + originBox.width / 2,
        y: originBox.y + originBox.height / 2,
      };
      return (
        Math.abs(mapCenter.x - originCenter.x) <= 24 &&
        Math.abs(mapCenter.y - originCenter.y) <= 24
      );
    })
    .toBe(true);
}

async function installNavigationGeolocation(page: Page) {
  await page.addInitScript(() => {
    let current = {
      latitude: 19.0433,
      longitude: -98.2019,
      accuracy: 8,
    };
    let nextWatchId = 1;
    const watchers = new Map<number, PositionCallback>();
    const position = (): GeolocationPosition => ({
      coords: {
        ...current,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON: () => current,
      },
      timestamp: Date.now(),
      toJSON: () => current,
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        clearWatch: (watchId: number) => watchers.delete(watchId),
        getCurrentPosition: (success: PositionCallback) => success(position()),
        watchPosition: (success: PositionCallback) => {
          const watchId = nextWatchId;
          nextWatchId += 1;
          watchers.set(watchId, success);
          setTimeout(() => success(position()), 0);
          return watchId;
        },
      },
    });
    Object.defineProperty(window, "__emitNavigationPosition", {
      configurable: true,
      value: (latitude: number, longitude: number, accuracy = 8) => {
        current = { latitude, longitude, accuracy };
        watchers.forEach((listener) => listener(position()));
      },
    });
  });
}

async function emitNavigationPosition(
  page: Page,
  latitude: number,
  longitude: number,
  accuracy = 8,
) {
  await page.evaluate(
    ({ nextLatitude, nextLongitude, nextAccuracy }) => {
      const emit = (
        window as typeof window & {
          __emitNavigationPosition: (
            latitude: number,
            longitude: number,
            accuracy?: number,
          ) => void;
        }
      ).__emitNavigationPosition;
      emit(nextLatitude, nextLongitude, nextAccuracy);
    },
    {
      nextLatitude: latitude,
      nextLongitude: longitude,
      nextAccuracy: accuracy,
    },
  );
}

async function prepareAuthenticatedNavigation(
  page: Page,
  options: NavigationMockOptions = {},
) {
  const availableModes = options.availableModes ?? ["driving"];
  let capabilityCalls = 0;
  let routeCalls = 0;
  const routeBodies: unknown[] = [];

  await page.addInitScript(
    ({ token, user }) => {
      window.localStorage.setItem("@pawalert_token", token);
      window.localStorage.setItem("@pawalert_user", JSON.stringify(user));
    },
    { token: TOKEN, user: volunteer },
  );

  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    expect(request.headers().authorization).toBe(`Bearer ${TOKEN}`);

    if (url.pathname === "/users/me") {
      await json(route, 200, volunteer);
      return;
    }

    const navigationBase = `/voluntarios/me/reportes/${REPORT_ID}/navegacion`;
    if (url.pathname === `${navigationBase}/capabilities`) {
      capabilityCalls += 1;
      if (options.revokeAfterInitialRoute && capabilityCalls > 1) {
        const code = options.revocationCode ?? "navigation_not_found";
        await json(route, code === "navigation_not_found" ? 404 : 409, {
          detail: {
            code,
            message:
              code === "navigation_not_found"
                ? "No encontramos una ruta asignada para este caso."
                : "Este caso ya no necesita una ruta operativa.",
          },
        });
        return;
      }
      await json(route, 200, {
        ...capabilities,
        available_modes: availableModes,
        destination_revision:
          options.updateDestinationAfterInitialRoute && capabilityCalls > 1
            ? updatedDestination.revision
            : destination.revision,
      });
      return;
    }

    if (url.pathname === `${navigationBase}/ruta`) {
      routeCalls += 1;
      const requestBody = request.postDataJSON();
      routeBodies.push(requestBody);
      if (options.failRecalculationWithNetworkError && routeCalls > 1) {
        await route.abort("internetdisconnected");
        return;
      }
      const responseDestination =
        options.updateDestinationAfterInitialRoute && routeCalls > 1
          ? updatedDestination
          : destination;
      const origin = {
        source: "device_gps",
        ...requestBody.origin,
      };
      const common = {
        contract_version: 1,
        report_id: REPORT_ID,
        mode: requestBody.mode,
        available_modes: availableModes,
        origin,
        destination: responseDestination,
        calculated_at: "2026-09-01T15:01:00.000Z",
        source: "osrm",
        warnings:
          options.updateDestinationAfterInitialRoute && routeCalls > 1
            ? ["destination_changed"]
            : [],
      };

      if (options.noRoute) {
        await json(route, 200, {
          ...common,
          status: "unavailable",
          route: null,
          expires_at: null,
          error_code: "no_route",
          retryable: false,
        });
        return;
      }

      await json(route, 200, {
        ...common,
        status: "complete",
        route: {
          duration_seconds: 720,
          distance_meters: 5400,
          geometry: {
            type: "LineString",
            coordinates: [
              [-98.2019, 19.0433],
              [-98.2295, 19.045],
              [responseDestination.longitude, responseDestination.latitude],
            ],
          },
          steps: [
            {
              type: "turn",
              modifier: "right",
              street_name: "Avenida 11 Sur",
              distance_meters: 320,
              duration_seconds: 44,
              location: [-98.2081, 19.043],
            },
          ],
        },
        expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        error_code: null,
        retryable: null,
      });
      return;
    }

    await json(route, 404, { detail: "Mock E2E sin respuesta configurada." });
  });

  return {
    capabilityCalls: () => capabilityCalls,
    routeCalls: () => routeCalls,
    routeBodies,
  };
}

test("muestra, recalcula y retira una ruta de asignación confirmada", async ({
  page,
}) => {
  const mock = await prepareAuthenticatedNavigation(page, {
    revokeAfterInitialRoute: true,
  });

  await page.goto(`/navegacion-caso/${REPORT_ID}`);

  await expect(page.getByText("Ruta del caso")).toBeVisible();
  await expect(page.getByText("Última ubicación confirmada")).toBeVisible();
  await expect(page.getByText("12 min")).toBeVisible();
  await expect(page.getByText("5.4 km")).toBeVisible();
  await expect(
    page.getByText("Gira a la derecha en Avenida 11 Sur"),
  ).toBeVisible();
  await expect(page.getByText(/^En \d+(?:\.\d+)? (?:m|km)$/)).toBeVisible();
  await expect(page.getByLabel("Mapa de navegación del caso")).toBeVisible();
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
  await expect(page.locator(".leaflet-control-attribution")).toContainText(
    "Leaflet",
  );
  await expect(
    page.getByText(
      "Ubicación en vivo activa mientras mantengas PawAlert abierta.",
    ),
  ).toBeVisible();
  await expectOriginNearMapCenter(page);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByLabel("Ver la ruta completa").click();
  await expectNavigationMapFitsViewport(page);
  await page.getByLabel("Seguir mi ubicación").click();
  await expectOriginNearMapCenter(page);

  expect(mock.routeCalls()).toBe(1);
  expect(mock.routeBodies[0]).toMatchObject({
    mode: "driving",
    origin: {
      latitude: 19.0433,
      longitude: -98.2019,
    },
  });
  expect(mock.routeBodies[0]).not.toHaveProperty("destination");

  await page.getByLabel("Recalcular ruta desde mi ubicación").click();
  await expect.poll(mock.routeCalls).toBe(2);

  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(mock.capabilityCalls).toBeGreaterThan(1);
  await expect(
    page.getByText("La navegación ya no está disponible"),
  ).toBeVisible();
  await expect(
    page.getByLabel("Mapa de navegación del caso"),
  ).not.toBeVisible();
});

test("cambia entre los perfiles de traslado publicados", async ({ page }) => {
  const mock = await prepareAuthenticatedNavigation(page, {
    availableModes: ["driving", "cycling", "walking"],
  });

  await page.goto(`/navegacion-caso/${REPORT_ID}`);
  await expect.poll(mock.routeCalls).toBe(1);
  await expect(page.getByLabel("Ir en vehículo, seleccionado")).toBeVisible();

  await page.getByLabel("Ir en bicicleta").click();
  await expect.poll(mock.routeCalls).toBe(2);
  expect(mock.routeBodies[1]).toMatchObject({ mode: "cycling" });
  await expect(page.getByLabel("Modo de navegación: bicicleta")).toBeVisible();
  await expect(page.getByLabel("Ir en bicicleta, seleccionado")).toBeVisible();
  await expect(page.getByText("Google Maps")).toBeVisible();
  await expect(page.getByText("Waze")).not.toBeVisible();

  await page.getByLabel("Ir a pie").click();
  await expect.poll(mock.routeCalls).toBe(3);
  expect(mock.routeBodies[2]).toMatchObject({ mode: "walking" });
  await expect(page.getByLabel("Modo de navegación: a pie")).toBeVisible();
  await expect(page.getByLabel("Ir a pie, seleccionado")).toBeVisible();
});

test("degrada NoRoute sin presentar la línea como ruta vial", async ({
  page,
}) => {
  await prepareAuthenticatedNavigation(page, { noRoute: true });

  await page.goto(`/navegacion-caso/${REPORT_ID}`);

  await expect(
    page.getByText(
      "La línea punteada solo orienta hacia el destino. No representa una calle ni permite confirmar la llegada.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Tiempo y distancia vial no disponibles"),
  ).toBeVisible();
  await expect(page.getByLabel("Mapa de navegación del caso")).toBeVisible();
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
  await expect(page.getByText("Google Maps")).toBeVisible();
  await expect(page.getByText("Waze")).toBeVisible();
  await expect(page.getByText("Tiempo estimado")).not.toBeVisible();
});

test("recalcula una sola vez después de confirmar un desvío GPS", async ({
  page,
}) => {
  await installNavigationGeolocation(page);
  const mock = await prepareAuthenticatedNavigation(page);
  await page.goto(`/navegacion-caso/${REPORT_ID}`);
  await expect.poll(mock.routeCalls).toBe(1);
  await expect(
    page.getByText(
      "Ubicación en vivo activa mientras mantengas PawAlert abierta.",
    ),
  ).toBeVisible();

  await page.evaluate(() => {
    const currentTime = Date.now();
    Date.now = () => currentTime + 40_000;
  });
  for (const latitude of [19.06, 19.0601, 19.0602]) {
    await emitNavigationPosition(page, latitude, -98.2019);
  }

  await expect.poll(mock.routeCalls).toBe(2);
  expect(mock.routeBodies[1]).toMatchObject({
    mode: "driving",
    origin: {
      latitude: 19.0602,
      longitude: -98.2019,
    },
  });
  await page.waitForTimeout(1_000);
  expect(mock.routeCalls()).toBe(2);
});

test("ignora saltos con GPS impreciso y conserva la ruta vigente", async ({
  page,
}) => {
  await installNavigationGeolocation(page);
  const mock = await prepareAuthenticatedNavigation(page);
  await page.goto(`/navegacion-caso/${REPORT_ID}`);
  await expect.poll(mock.routeCalls).toBe(1);

  for (const latitude of [19.06, 19.0601, 19.0602]) {
    await emitNavigationPosition(page, latitude, -98.2019, 150);
  }

  await expect(
    page.getByText(/La señal GPS es imprecisa.*Conservamos la ruta/),
  ).toBeVisible();
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
  expect(mock.routeCalls()).toBe(1);
});

test("conserva la ruta anterior cuando se pierde la conexión", async ({
  page,
}) => {
  const mock = await prepareAuthenticatedNavigation(page, {
    failRecalculationWithNetworkError: true,
  });
  await page.goto(`/navegacion-caso/${REPORT_ID}`);
  await expect.poll(mock.routeCalls).toBe(1);

  await page.getByLabel("Recalcular ruta desde mi ubicación").click();

  await expect.poll(mock.routeCalls).toBe(2);
  await expect(
    page.getByText(
      /No pudimos actualizar la navegación.*La ruta anterior permanece visible/,
    ),
  ).toBeVisible();
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
});

test("actualiza el destino cuando aparece un avistamiento validado", async ({
  page,
}) => {
  await installNavigationGeolocation(page);
  const mock = await prepareAuthenticatedNavigation(page, {
    updateDestinationAfterInitialRoute: true,
  });
  await page.goto(`/navegacion-caso/${REPORT_ID}`);
  await expect.poll(mock.routeCalls).toBe(1);

  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect.poll(mock.capabilityCalls).toBeGreaterThan(1);
  await expect.poll(mock.routeCalls).toBe(2);
  expect(mock.routeBodies[1]).toMatchObject({
    known_destination_revision: destination.revision,
  });
  await expect(
    page.getByText(/La ubicación confirmada cambió.*destino más reciente/),
  ).toBeVisible();
});

test("retira la ruta cuando el caso se cancela durante el trayecto", async ({
  page,
}) => {
  const mock = await prepareAuthenticatedNavigation(page, {
    revokeAfterInitialRoute: true,
    revocationCode: "report_not_navigable",
  });
  await page.goto(`/navegacion-caso/${REPORT_ID}`);
  await expect.poll(mock.routeCalls).toBe(1);

  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect.poll(mock.capabilityCalls).toBeGreaterThan(1);
  await expect(
    page.getByText("La navegación ya no está disponible"),
  ).toBeVisible();
  await expect(
    page.getByLabel("Mapa de navegación del caso"),
  ).not.toBeVisible();
});
