import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the built web app, served at /budget-planner/ as on the site.
// Every engine runs every test: the save and sync promises have to hold everywhere.
const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/budget-planner/`,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 15'] } },
  ],
  webServer: {
    command: `npm run build:web && npm run build:offline && npx vite preview --mode web --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/budget-planner/`,
    reuseExistingServer: !process.env.CI,
  },
});
