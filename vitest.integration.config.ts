import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

// Local Supabase URL/keys live in the gitignored .env (written by
// `pnpm local:setup`). Vitest config runs in plain Node, so load it
// manually rather than adding a dotenv dependency for this one file.
const envPath = `${rootDir}.env`
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match) continue

    const [, key, rawValue] = match
    if (key === undefined || process.env[key] !== undefined) continue

    process.env[key] = rawValue?.startsWith('"') && rawValue.endsWith('"')
      ? JSON.parse(rawValue) as string
      : rawValue
  }
}

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
    fileParallelism: false,
    globals: false,
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 20_000,
  },
})
