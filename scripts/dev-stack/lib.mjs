import { createHmac, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const stackStateDir = resolve(repoRoot, '.dev-stack')

export const stackConfig = {
  dbSuperuserUrl: process.env.DEV_STACK_DB_URL ?? 'postgresql://postgres@127.0.0.1:54322/postgres',
  gatewayPort: Number(process.env.DEV_STACK_GATEWAY_PORT ?? 54321),
  postgrestPort: Number(process.env.DEV_STACK_POSTGREST_PORT ?? 54331),
}

export function ensureStackStateDir() {
  mkdirSync(stackStateDir, { recursive: true })
}

function base64Url(input) {
  return Buffer.from(input).toString('base64url')
}

export function signJwt(claims, secret, expiresInSeconds = 60 * 60 * 24 * 365 * 10) {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iat: now,
    exp: now + expiresInSeconds,
    iss: 'rybolov-dev-stack',
    ...claims,
  }
  const encoded = `${base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64Url(JSON.stringify(payload))}`
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url')

  return `${encoded}.${signature}`
}

export function verifyJwt(token, secret) {
  if (typeof token !== 'string') return undefined
  const parts = token.split('.')
  if (parts.length !== 3) return undefined

  const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url')
  if (expected !== parts[2]) return undefined

  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) return undefined

    return claims
  }
  catch {
    return undefined
  }
}

/**
 * Loads (or creates on first run) the harness secrets: the JWT secret plus
 * the derived anon and service-role keys. Stored under .dev-stack/ which is
 * gitignored — nothing here may be committed or printed to logs.
 */
export function loadStackSecrets() {
  ensureStackStateDir()
  const secretsPath = resolve(stackStateDir, 'secrets.json')

  if (existsSync(secretsPath)) {
    return JSON.parse(readFileSync(secretsPath, 'utf8'))
  }

  const jwtSecret = randomBytes(48).toString('base64url')
  const secrets = {
    anonKey: signJwt({ role: 'anon' }, jwtSecret),
    jwtSecret,
    serviceRoleKey: signJwt({ role: 'service_role' }, jwtSecret),
  }
  writeFileSync(secretsPath, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 })

  return secrets
}

export function stackEnvValues() {
  const secrets = loadStackSecrets()
  const apiUrl = `http://127.0.0.1:${stackConfig.gatewayPort}`

  return {
    NUXT_PUBLIC_SUPABASE_ANON_KEY: secrets.anonKey,
    NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secrets.anonKey,
    NUXT_PUBLIC_SUPABASE_URL: apiUrl,
    SUPABASE_DB_URL: stackConfig.dbSuperuserUrl,
    SUPABASE_SECRET_KEY: secrets.serviceRoleKey,
    SUPABASE_SERVICE_ROLE_KEY: secrets.serviceRoleKey,
  }
}

export function upsertEnvFile(envPath, values) {
  let content = ''

  try {
    content = readFileSync(envPath, 'utf8')
  }
  catch {
    content = ''
  }

  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${JSON.stringify(value)}`
    const pattern = new RegExp(`^${key}=.*$`, 'm')
    content = pattern.test(content)
      ? content.replace(pattern, line)
      : `${content.trimEnd()}\n${line}\n`
  }

  writeFileSync(envPath, `${content.trimEnd()}\n`, { mode: 0o600 })
}
