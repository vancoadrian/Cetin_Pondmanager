import { randomBytes, randomUUID, scrypt as nodeScrypt } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { createClient } from '@supabase/supabase-js'

/**
 * Seed accounts no longer share one hardcoded password (see
 * scripts/generate-seed-credentials.ts). The login/session e2e specs need a
 * deterministic password to log in as any seed role, so this ensures every
 * one of them has a known e2e-only credential — without ever touching or
 * overwriting a credential a developer may have already generated for real
 * local use (it only ever fills in accounts that have no override yet).
 *
 * The credential overrides live in the `account-state` runtime document:
 * in Supabase (runtime_store_states) when the app runs on the Supabase
 * driver, or in the legacy JSON file when RYBOLOV_STORAGE_DRIVER=file.
 */

// Playwright nejde cez Nuxt env pipeline — bez tohto by setup nevidel
// Supabase kľúče z .env a potichu by zapísal heslá do legacy JSON súboru
try {
  process.loadEnvFile(resolve(process.cwd(), '.env'))
}
catch {
  // .env nemusí existovať (CI) — premenné vtedy prichádzajú z prostredia
}

const scrypt = promisify(nodeScrypt)
const HASH_BYTES = 64
export const E2E_PASSWORD = 'Cetin2026!'
const E2E_SEED_ACCOUNT_IDS = [
  'angler-marek',
  'owner',
  'manager',
  'marshal',
  'organizer',
  'team',
  'accountant',
  'worker',
]

async function createPasswordHash(password: string) {
  const salt = randomBytes(16).toString('hex')
  const derived = (await scrypt(password, salt, HASH_BYTES)) as Buffer
  return `scrypt:${salt}:${derived.toString('hex')}`
}

const storePath = process.env.RYBOLOV_LOCAL_ACCOUNT_STORE
  ?? resolve(process.cwd(), '.data', 'rybolov-cetin', 'account-state.json')

interface CredentialOverride {
  accountId: string
  passwordHash: string
  updatedAt: string
}

interface LocalAccountState {
  credentialOverrides: CredentialOverride[]
  [key: string]: unknown
}

function createSeedState(): LocalAccountState {
  return {
    credentialOverrides: [],
    deletions: [],
    passwordResets: [],
    profileOverrides: [],
    registeredAccounts: [],
    updatedAt: new Date(0).toISOString(),
    version: 1,
  }
}

function isAccountState(value: unknown): value is LocalAccountState {
  return Boolean(value)
    && typeof value === 'object'
    && Array.isArray((value as LocalAccountState).credentialOverrides)
}

async function appendMissingOverrides(state: LocalAccountState) {
  const existingIds = new Set(state.credentialOverrides.map((item) => item.accountId))
  const missingIds = E2E_SEED_ACCOUNT_IDS.filter((id) => !existingIds.has(id))
  if (missingIds.length === 0) return false

  for (const accountId of missingIds) {
    state.credentialOverrides.push({
      accountId,
      passwordHash: await createPasswordHash(E2E_PASSWORD),
      updatedAt: new Date().toISOString(),
    })
  }

  return true
}

async function seedThroughFileDriver() {
  let state: LocalAccountState
  try {
    const raw = await readFile(storePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    state = isAccountState(parsed) ? parsed : createSeedState()
  }
  catch {
    state = createSeedState()
  }

  if (!(await appendMissingOverrides(state))) return

  await mkdir(dirname(storePath), { recursive: true })
  const tempPath = `${storePath}.${randomUUID()}.tmp`
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(tempPath, storePath)
}

async function seedThroughSupabase(url: string, secretKey: string) {
  const client = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client
    .from('runtime_store_states')
    .select('payload')
    .eq('name', 'account-state')
    .maybeSingle<{ payload: unknown }>()

  if (error) {
    throw new Error(`E2E setup nevie načítať account-state zo Supabase: ${error.message}`)
  }

  const state = data && isAccountState(data.payload) ? data.payload : createSeedState()
  if (!(await appendMissingOverrides(state))) return

  const { error: writeError } = await client.rpc('runtime_store_upsert', {
    store_name: 'account-state',
    store_payload: state,
  })

  if (writeError) {
    throw new Error(`E2E setup nevie zapísať account-state do Supabase: ${writeError.message}`)
  }
}

export default async function globalSetup() {
  const driver = process.env.RYBOLOV_STORAGE_DRIVER?.trim().toLowerCase() ?? 'supabase'
  const supabaseUrl = process.env.NUXT_PUBLIC_SUPABASE_URL?.trim()
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (driver !== 'file' && supabaseUrl && secretKey) {
    await seedThroughSupabase(supabaseUrl, secretKey)
    return
  }

  await seedThroughFileDriver()
}
