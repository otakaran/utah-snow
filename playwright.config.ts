import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4173);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? undefined : 4, // 8 default workers x 4 projects beside vite preview starved this Mac (2026-10-20)
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'phone', use: { ...devices['iPhone 15'] } },
    { name: 'laptop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'wall', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
    { name: 'tz', use: { ...devices['Desktop Chrome'], timezoneId: 'America/Los_Angeles' } },
  ],
  webServer: {
    command: `pnpm exec vite preview --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
