import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8002',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'cd ../backend && CUDA_VISIBLE_DEVICES="" ../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8002',
    port: 8002,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
  },
});
