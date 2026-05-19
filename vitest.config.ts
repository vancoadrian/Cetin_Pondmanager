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
