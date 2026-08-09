import { randomBytes, randomUUID, scrypt as nodeScrypt } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'

/**
 * Seed accounts no longer share one hardcoded password (see
 * scripts/generate-seed-credentials.ts). The login/session e2e specs need a
 * deterministic password to log in as any seed role, so this ensures every
 * one of them has a known e2e-only credential — without ever touching or
 * overwriting a credential a developer may have already generated for real
 * local use (it only ever fills in accounts that have no override yet).
 */

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

async function readState(): Promise<LocalAccountState> {
  try {
    const raw = await readFile(storePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && Array.isArray((parsed as LocalAccountState).credentialOverrides)
      ? parsed as LocalAccountState
      : createSeedState()
  }
  catch {
    return createSeedState()
  }
}

async function writeState(state: LocalAccountState) {
  await mkdir(dirname(storePath), { recursive: true })
  const tempPath = `${storePath}.${randomUUID()}.tmp`
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(tempPath, storePath)
}

export default async function globalSetup() {
  const state = await readState()
  const existingIds = new Set(state.credentialOverrides.map((item) => item.accountId))
  const missingIds = E2E_SEED_ACCOUNT_IDS.filter((id) => !existingIds.has(id))
  if (missingIds.length === 0) return

  for (const accountId of missingIds) {
    state.credentialOverrides.push({
      accountId,
      passwordHash: await createPasswordHash(E2E_PASSWORD),
      updatedAt: new Date().toISOString(),
    })
  }
  await writeState(state)
}
