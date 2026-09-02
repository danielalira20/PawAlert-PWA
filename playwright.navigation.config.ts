import { defineConfig, devices } from '@playwright/test';

const frontendUrl = 'http://127.0.0.1:8092';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'navigation-flow.spec.ts',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    [
      'html',
      { outputFolder: 'playwright-report-navigation', open: 'never' },
    ],
  ],
  webServer: {
    command: 'CI=1 npx expo start --web --port 8092',
    url: frontendUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  use: {
    baseURL: frontendUrl,
    geolocation: { latitude: 19.0433, longitude: -98.2019 },
    permissions: ['geolocation'],
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'escritorio-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'movil-chromium',
      use: {
        ...devices['Pixel 7'],
      },
    },
  ],
});
