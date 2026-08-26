import { execFileSync, spawn } from 'node:child_process'
import { existsSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { resolve } from 'node:path'
import {
  ensureStackStateDir,
  loadStackSecrets,
  repoRoot,
  stackConfig,
  stackEnvValues,
  stackStateDir,
  upsertEnvFile,
} from './lib.mjs'

/**
 * Starts the dev-stack (PostgREST + gateway with auth/storage shims) against
 * an already-running plain Postgres. For machines with Docker, prefer the
 * real thing: `pnpm supabase:start` + `pnpm local:setup`.
 *
 * Usage: node scripts/dev-stack/start.mjs [--write-env] [--reset-db]
 */

const writeEnv = process.argv.includes('--write-env')
const resetDb = process.argv.includes('--reset-db')

ensureStackStateDir()
const secrets = loadStackSecrets()

function isPidRunning(pid) {
  try {
    process.kill(pid, 0)

    return true
  }
  catch {
    return false
  }
}

function readPid(name) {
  const pidPath = resolve(stackStateDir, `${name}.pid`)
  if (!existsSync(pidPath)) return undefined

  const pid = Number(readFileSync(pidPath, 'utf8').trim())

  return Number.isFinite(pid) && isPidRunning(pid) ? pid : undefined
}

function launchDetached(name, command, args, env = {}) {
  const logPath = resolve(stackStateDir, `${name}.log`)
  const logFd = openSync(logPath, 'a')
  const child = spawn(command, args, {
    cwd: repoRoot,
    detached: true,
    env: { ...process.env, ...env },
    stdio: ['ignore', logFd, logFd],
  })
  child.unref()
  writeFileSync(resolve(stackStateDir, `${name}.pid`), `${child.pid}\n`)
  console.log(`[dev-stack] ${name} started (pid ${child.pid}, log ${logPath})`)
}

function waitForPort(port, timeoutMs = 20000) {
  const startedAt = Date.now()

  return new Promise((resolvePromise, rejectPromise) => {
    const attempt = () => {
      const socket = createConnection({ host: '127.0.0.1', port }, () => {
        socket.destroy()
        resolvePromise()
      })
      socket.on('error', () => {
        socket.destroy()
        if (Date.now() - startedAt > timeoutMs) {
          rejectPromise(new Error(`Port ${port} did not open within ${timeoutMs}ms`))
        }
        else {
          setTimeout(attempt, 400)
        }
      })
    }
    attempt()
  })
}

execFileSync('node', [
  resolve(repoRoot, 'scripts/dev-stack/apply-sql.mjs'),
  ...(resetDb ? ['--reset'] : []),
], { cwd: repoRoot, stdio: 'inherit' })

const postgrestConfPath = resolve(stackStateDir, 'postgrest.conf')
const dbUri = new URL(stackConfig.dbSuperuserUrl)
dbUri.username = 'authenticator'
dbUri.password = 'postgres'
writeFileSync(postgrestConfPath, [
  `db-uri = "${dbUri.toString()}"`,
  'db-schemas = "public"',
  'db-anon-role = "anon"',
  `jwt-secret = "${secrets.jwtSecret}"`,
  'server-host = "127.0.0.1"',
  `server-port = ${stackConfig.postgrestPort}`,
  '',
].join('\n'), { mode: 0o600 })

if (readPid('postgrest')) {
  console.log('[dev-stack] postgrest already running')
}
else {
  rmSync(resolve(stackStateDir, 'postgrest.log'), { force: true })
  launchDetached('postgrest', 'postgrest', [postgrestConfPath])
}

if (readPid('gateway')) {
  console.log('[dev-stack] gateway already running')
}
else {
  rmSync(resolve(stackStateDir, 'gateway.log'), { force: true })
  launchDetached('gateway', process.execPath, [resolve(repoRoot, 'scripts/dev-stack/gateway.mjs')])
}

await waitForPort(stackConfig.postgrestPort)
await waitForPort(stackConfig.gatewayPort)

if (writeEnv) {
  upsertEnvFile(resolve(repoRoot, '.env'), stackEnvValues())
  console.log('[dev-stack] Supabase-compatible values written to .env (secrets not printed).')
}

console.log(`[dev-stack] ready: API http://127.0.0.1:${stackConfig.gatewayPort} (rest, auth shim, storage shim)`)
