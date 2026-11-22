import { defineConfig } from '@playwright/test'
import { E2E_PORT } from './e2e/constants.js'

const baseURL = `http://localhost:${E2E_PORT}` // localhost: browsers keep Secure cookies over plain HTTP only there

export default defineConfig({
  testDir: 'e2e',
  timeout: 300_000,
  workers: 1,
  fullyParallel: false,
  webServer: { command: 'npx tsx e2e/serve.ts', url: `${baseURL}/healthz`, reuseExistingServer: false, timeout: 60_000, gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 } },
  use: { baseURL, channel: process.env.STICK_E2E_CHANNEL },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
