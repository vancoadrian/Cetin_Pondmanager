import { defineConfig, devices } from '@playwright/test'

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, '')
const baseURL = externalBaseUrl || 'http://127.0.0.1:3000'

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: 'test-results/playwright',
  projects: [
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        channel: 'chrome',
        screen: { height: 844, width: 390 },
        viewport: { height: 844, width: 390 },
      },
    },
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        screen: { height: 900, width: 1280 },
        viewport: { height: 900, width: 1280 },
      },
    },
  ],
  reporter: process.env.CI ? 'github' : 'list',
  retries: process.env.CI ? 1 : 0,
  testDir: './e2e',
  timeout: 45_000,
  use: {
    baseURL,
    locale: 'sk-SK',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    serviceWorkers: 'allow',
    timezoneId: 'Europe/Bratislava',
    trace: 'retain-on-failure',
    video: 'off',
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'pnpm build && HOST=127.0.0.1 PORT=3000 node .output/server/index.mjs',
        gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
        reuseExistingServer: !process.env.CI,
        stderr: 'pipe',
        stdout: 'pipe',
        timeout: 240_000,
        url: baseURL,
      },
  workers: 1,
})
