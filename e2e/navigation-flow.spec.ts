import { expect, test, type Page, type Route } from '@playwright/test';

const REPORT_ID = '11111111-2222-4333-8444-555555555555';
const API_ORIGIN = 'http://localhost:8000';
const TOKEN = 'e2e-navigation-token';

const volunteer = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  nombre: 'Valeria',
  apellido_paterno: 'Prueba',
  email: 'voluntaria.navegacion@example.test',
  telefono: '2220000000',
  rol: 'voluntario',
  tiene_perfil_apoyo: true,
  tipo_perfil_apoyo: 'voluntario_interno',
};

const destination = {
  source: 'validated_sighting',
  latitude: 19.0474,
  longitude: -98.2582,
  confirmed_at: '2026-09-01T15:00:00.000Z',
  revision: 'sighting:e2e-1',
};

const capabilities = {
  contract_version: 1,
  navigation_enabled: true,
  available_modes: ['driving'],
  destination_revision: destination.revision,
  foreground_tracking: true,
  background_tracking: false,
  voice_guidance: false,
  live_traffic: false,
};

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'Authorization, Content-Type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'content-type': 'application/json',
};

interface NavigationMockOptions {
  noRoute?: boolean;
  revokeAfterInitialRoute?: boolean;
}

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    headers: corsHeaders,
    body: JSON.stringify(body),
  });
}

async function expectNavigationMapFitsViewport(page: Page) {
  const map = page.getByLabel('Mapa de navegación del caso');
  const viewport = page.viewportSize();
  await expect
    .poll(async () => {
      const mapBox = await map.boundingBox();
      if (!mapBox) return false;
      if (viewport && viewport.width < 900 && mapBox.height > 320) return false;

      for (const selector of [
        '.pawalert-navigation-origin',
        '.pawalert-navigation-destination',
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

async function prepareAuthenticatedNavigation(
  page: Page,
  options: NavigationMockOptions = {},
) {
  let capabilityCalls = 0;
  let routeCalls = 0;
  const routeBodies: unknown[] = [];

  await page.addInitScript(
    ({ token, user }) => {
      window.localStorage.setItem('@pawalert_token', token);
      window.localStorage.setItem('@pawalert_user', JSON.stringify(user));
    },
    { token: TOKEN, user: volunteer },
  );

  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    expect(request.headers().authorization).toBe(`Bearer ${TOKEN}`);

    if (url.pathname === '/users/me') {
      await json(route, 200, volunteer);
      return;
    }

    const navigationBase = `/voluntarios/me/reportes/${REPORT_ID}/navegacion`;
    if (url.pathname === `${navigationBase}/capabilities`) {
      capabilityCalls += 1;
      if (options.revokeAfterInitialRoute && capabilityCalls > 1) {
        await json(route, 404, {
          detail: {
            code: 'navigation_not_found',
            message: 'No encontramos una ruta asignada para este caso.',
          },
        });
        return;
      }
      await json(route, 200, capabilities);
      return;
    }

    if (url.pathname === `${navigationBase}/ruta`) {
      routeCalls += 1;
      routeBodies.push(request.postDataJSON());
      const origin = {
        source: 'device_gps',
        latitude: 19.0433,
        longitude: -98.2019,
        accuracy_meters: 0,
        captured_at: '2026-09-01T15:01:00.000Z',
      };
      const common = {
        contract_version: 1,
        report_id: REPORT_ID,
        mode: 'driving',
        available_modes: ['driving'],
        origin,
        destination,
        calculated_at: '2026-09-01T15:01:00.000Z',
        source: 'osrm',
        warnings: [],
      };

      if (options.noRoute) {
        await json(route, 200, {
          ...common,
          status: 'unavailable',
          route: null,
          expires_at: null,
          error_code: 'no_route',
          retryable: false,
        });
        return;
      }

      await json(route, 200, {
        ...common,
        status: 'complete',
        route: {
          duration_seconds: 720,
          distance_meters: 5400,
          geometry: {
            type: 'LineString',
            coordinates: [
              [-98.2019, 19.0433],
              [-98.2295, 19.045],
              [-98.2582, 19.0474],
            ],
          },
          steps: [
            {
              type: 'turn',
              modifier: 'right',
              street_name: 'Avenida 11 Sur',
              distance_meters: 320,
              duration_seconds: 44,
              location: [-98.2081, 19.043],
            },
          ],
        },
        expires_at: '2026-09-01T15:06:00.000Z',
        error_code: null,
        retryable: null,
      });
      return;
    }

    await json(route, 404, { detail: 'Mock E2E sin respuesta configurada.' });
  });

  return {
    capabilityCalls: () => capabilityCalls,
    routeCalls: () => routeCalls,
    routeBodies,
  };
}

test('muestra, recalcula y retira una ruta de asignación confirmada', async ({
  page,
}) => {
  const mock = await prepareAuthenticatedNavigation(page, {
    revokeAfterInitialRoute: true,
  });

  await page.goto(`/navegacion-caso/${REPORT_ID}`);

  await expect(page.getByText('Ruta del caso')).toBeVisible();
  await expect(page.getByText('Última ubicación confirmada')).toBeVisible();
  await expect(page.getByText('12 min')).toBeVisible();
  await expect(page.getByText('5.4 km')).toBeVisible();
  await expect(
    page.getByText('Gira a la derecha en Avenida 11 Sur'),
  ).toBeVisible();
  await expect(page.getByText('En 320 m')).toBeVisible();
  await expect(
    page.getByLabel('Mapa de navegación del caso'),
  ).toBeVisible();
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(1);
  await expect(page.locator('.leaflet-control-attribution')).toContainText(
    'Leaflet',
  );
  await expect(
    page.getByText('Pulsa Recalcular para actualizar tu ubicación.'),
  ).toBeVisible();
  await expectNavigationMapFitsViewport(page);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByLabel('Centrar toda la ruta').click();
  await expectNavigationMapFitsViewport(page);

  expect(mock.routeCalls()).toBe(1);
  expect(mock.routeBodies[0]).toMatchObject({
    mode: 'driving',
    origin: {
      latitude: 19.0433,
      longitude: -98.2019,
    },
  });
  expect(mock.routeBodies[0]).not.toHaveProperty('destination');

  await page.getByLabel('Recalcular ruta desde mi ubicación').click();
  await expect.poll(mock.routeCalls).toBe(2);

  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(mock.capabilityCalls).toBeGreaterThan(1);
  await expect(
    page.getByText('La navegación ya no está disponible'),
  ).toBeVisible();
  await expect(
    page.getByLabel('Mapa de navegación del caso'),
  ).not.toBeVisible();
});

test('degrada NoRoute sin presentar la línea como ruta vial', async ({ page }) => {
  await prepareAuthenticatedNavigation(page, { noRoute: true });

  await page.goto(`/navegacion-caso/${REPORT_ID}`);

  await expect(
    page.getByText(
      'La línea punteada solo orienta hacia el destino. No representa una calle ni permite confirmar la llegada.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText('Tiempo y distancia vial no disponibles'),
  ).toBeVisible();
  await expect(
    page.getByLabel('Mapa de navegación del caso'),
  ).toBeVisible();
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(1);
  await expect(page.getByText('Google Maps')).toBeVisible();
  await expect(page.getByText('Waze')).toBeVisible();
  await expect(page.getByText('Tiempo estimado')).not.toBeVisible();
});
