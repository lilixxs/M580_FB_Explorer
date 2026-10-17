import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:5191/explorer/',
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node scripts/serve-dist.mjs',
    url: 'http://127.0.0.1:5191/explorer/',
    reuseExistingServer: false
  }
})
