import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

interface WebPushVapidGenerator {
  generateVAPIDKeys: () => {
    privateKey: string
    publicKey: string
  }
}

function parseEnv(content: string) {
  return Object.fromEntries(content.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match) return []

    const rawValue = match[2] ?? ''
    const value = rawValue.startsWith('"') && rawValue.endsWith('"')
      ? JSON.parse(rawValue) as string
      : rawValue

    return [[match[1]!, value]]
  }))
}

function parseSupabaseStatus(content: string) {
  return parseEnv(content)
}

function setEnvValue(content: string, key: string, value: string) {
  const serialized = JSON.stringify(value)
  const line = `${key}=${serialized}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')

  return pattern.test(content)
    ? content.replace(pattern, line)
    : `${content.trimEnd()}\n${line}\n`
}

const rootDir = resolve('.')
const envPath = resolve(rootDir, '.env')
const examplePath = resolve(rootDir, '.env.example')
let content: string

try {
  content = await readFile(envPath, 'utf8')
}
catch {
  content = await readFile(examplePath, 'utf8')
}

const existing = parseEnv(content)
const webPushModule = await import('web-push') as unknown as WebPushVapidGenerator & {
  default?: WebPushVapidGenerator
}
const generateVapidKeys = webPushModule.generateVAPIDKeys
  ?? webPushModule.default?.generateVAPIDKeys

if (!generateVapidKeys) {
  throw new Error('web-push module does not expose generateVAPIDKeys.')
}

const vapidKeys = existing.NUXT_PUBLIC_VAPID_PUBLIC_KEY && existing.RYBOLOV_VAPID_PRIVATE_KEY
  ? {
      privateKey: existing.RYBOLOV_VAPID_PRIVATE_KEY,
      publicKey: existing.NUXT_PUBLIC_VAPID_PUBLIC_KEY,
    }
  : generateVapidKeys()

const supabaseStatus = parseSupabaseStatus(execFileSync(
  'supabase',
  ['status', '--output', 'env'],
  {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  },
))

const supabaseUrl = supabaseStatus.API_URL
const publishableKey = supabaseStatus.PUBLISHABLE_KEY ?? supabaseStatus.ANON_KEY
const anonKey = supabaseStatus.ANON_KEY ?? supabaseStatus.PUBLISHABLE_KEY
const secretKey = supabaseStatus.SECRET_KEY ?? supabaseStatus.SERVICE_ROLE_KEY
const serviceRoleKey = supabaseStatus.SERVICE_ROLE_KEY ?? supabaseStatus.SECRET_KEY
const databaseUrl = supabaseStatus.DB_URL

if (!supabaseUrl || !publishableKey || !secretKey || !databaseUrl) {
  throw new Error('Supabase local stack did not return the required local credentials.')
}

const values = {
  NUXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3000',
  NUXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  NUXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NUXT_PUBLIC_VAPID_PUBLIC_KEY: vapidKeys.publicKey,
  NUXT_PWA_DEV: 'true',
  RYBOLOV_PUSH_PROVIDER: 'web-push',
  RYBOLOV_PUSH_SUBJECT: 'mailto:spravca@rybolov-cetin.local',
  RYBOLOV_VAPID_PRIVATE_KEY: vapidKeys.privateKey,
  SUPABASE_DB_URL: databaseUrl,
  SUPABASE_SECRET_KEY: secretKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
}

for (const [key, value] of Object.entries(values)) {
  content = setEnvValue(content, key, value)
}

await writeFile(envPath, `${content.trimEnd()}\n`, { encoding: 'utf8', mode: 0o600 })
console.log(`Local environment written to ${envPath}.`)
console.log(`Configured ${Object.keys(values).length} Supabase, PWA and VAPID variables without printing secrets.`)
