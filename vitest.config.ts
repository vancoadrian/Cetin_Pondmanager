import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^~\/(assets|components|composables|data|layouts|middleware|pages|plugins|repositories|schemas|services|utils)\//,
        replacement: `${rootDir}app/$1/`,
      },
      {
        find: /^h3$/,
        replacement: `${rootDir}node_modules/.pnpm/h3@1.15.11/node_modules/h3/dist/index.mjs`,
      },
      { find: /^~\//, replacement: rootDir },
      { find: /^@\//, replacement: rootDir },
    ],
  },
  test: {
    environment: 'node',
    // Unit tests run against the explicit filesystem dev/test adapter with
    // per-test store paths; the Supabase driver is covered by
    // tests/integration/** against a live local stack.
    env: {
      RYBOLOV_STORAGE_DRIVER: 'file',
    },
    globals: false,
    include: ['tests/**/*.test.ts'],
    // tests/integration/** needs a live local Supabase (Docker) and has its
    // own config/script (vitest.integration.config.ts, `pnpm test:integration`).
    exclude: ['node_modules/**', 'tests/integration/**'],
  },
})
