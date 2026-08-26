import { defineConfig } from '@playwright/test'
import baseConfig from './playwright.config'

/**
 * Container/CI profile: identical to playwright.config.ts, but runs on a
 * preinstalled Chromium instead of the system Google Chrome channel, which
 * is unavailable in headless containers (cloud sandboxes, minimal CI
 * runners). Point PLAYWRIGHT_CHROMIUM_PATH at the Chromium binary when the
 * runner's browser build does not match the pinned Playwright version.
 * Usage: `pnpm test:e2e -- -c playwright.sandbox.config.ts`.
 */
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH

export default defineConfig({
  ...baseConfig,
  projects: baseConfig.projects?.map((project) => {
    const use = { ...project.use } as Record<string, unknown>
    delete use.channel
    if (chromiumExecutablePath) {
      use.launchOptions = {
        ...(use.launchOptions as Record<string, unknown> | undefined),
        executablePath: chromiumExecutablePath,
      }
    }

    return { ...project, use }
  }),
})
