import { defineConfig, devices } from '@playwright/test';

// The offline test needs the service worker, which only the production build has.
const OFFLINE = /offline\.spec\.ts/;

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:5175' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: OFFLINE },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: OFFLINE },
    {
      name: 'offline',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4176' },
      testMatch: OFFLINE,
    },
  ],
  webServer: [
    {
      command: 'npx vite --port 5175 --strictPort',
      port: 5175,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run build && npx vite preview --port 4176 --strictPort',
      port: 4176,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
