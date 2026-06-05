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
    globals: false,
    include: ['tests/**/*.test.ts'],
  },
})
