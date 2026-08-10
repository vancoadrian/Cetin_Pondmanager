import { randomBytes, randomInt, randomUUID, scrypt as nodeScrypt } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'

/**
 * Every seed/demo account (owner, manager, marshal, organizer, team,
 * accountant, worker, demo angler) used to share one hardcoded password
 * shipped in the client JS bundle. This script gives each one its own
 * randomly generated password, stored only as a scrypt hash in the local
 * account store's credentialOverrides. It is idempotent: existing overrides
 * are left untouched, and generated plaintext passwords are printed once.
 */

const scrypt = promisify(nodeScrypt)
const HASH_BYTES = 64

async function createPasswordHash(password: string) {
  const salt = randomBytes(16).toString('hex')
  const derived = (await scrypt(password, salt, HASH_BYTES)) as Buffer
  return `scrypt:${salt}:${derived.toString('hex')}`
}

function generateStrongPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  let password = ''
  for (let index = 0; index < 20; index += 1) {
    password += alphabet[randomInt(alphabet.length)]
  }
  return password
}

const SEED_ACCOUNT_LABELS: Record<string, string> = {
  'angler-marek': 'angler-marek (demo rybár)',
  accountant: 'accountant (účtovník)',
  manager: 'manager (správca)',
  marshal: 'marshal (kontrolór)',
  organizer: 'organizer (organizátor)',
  owner: 'owner (majiteľ)',
  team: 'team (súťažný tím)',
  worker: 'worker (brigádnik)',
}

interface CredentialOverride {
  accountId: string
  passwordHash: string
  updatedAt: string
}

interface LocalAccountState {
  credentialOverrides: CredentialOverride[]
  deletions: unknown[]
  passwordResets: unknown[]
  profileOverrides: unknown[]
  registeredAccounts: unknown[]
  updatedAt: string
  version: 1
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

function isLocalAccountState(value: unknown): value is LocalAccountState {
  return Boolean(value) && typeof value === 'object' && Array.isArray((value as LocalAccountState).credentialOverrides)
}

const storePath = process.env.RYBOLOV_LOCAL_ACCOUNT_STORE
  ?? resolve(process.cwd(), '.data', 'rybolov-cetin', 'account-state.json')

async function readState(): Promise<LocalAccountState> {
  try {
    const raw = await readFile(storePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    return isLocalAccountState(parsed) ? parsed : createSeedState()
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

const state = await readState()
const existingIds = new Set(state.credentialOverrides.map((item) => item.accountId))
const generated: Array<{ accountId: string, password: string }> = []

for (const accountId of Object.keys(SEED_ACCOUNT_LABELS)) {
  if (existingIds.has(accountId)) continue
  const password = generateStrongPassword()
  state.credentialOverrides.push({
    accountId,
    passwordHash: await createPasswordHash(password),
    updatedAt: new Date().toISOString(),
  })
  generated.push({ accountId, password })
}

if (generated.length === 0) {
  console.log('Všetky seed účty už majú vlastné heslo — nič sa nezmenilo.')
  console.log(`Ak chceš heslo vynulovať, zmaž príslušný záznam v credentialOverrides v ${storePath} a spusti skript znova.`)
}
else {
  state.updatedAt = new Date().toISOString()
  await writeState(state)
  console.log('Vygenerované jedinečné heslá pre seed účty. Ulož si ich TERAZ — nabudúce sa nezobrazia:')
  console.log('')
  for (const item of generated) {
    console.log(`  ${(SEED_ACCOUNT_LABELS[item.accountId] ?? item.accountId).padEnd(28)} ${item.password}`)
  }
  console.log('')
  console.log(`Heslá sú uložené iba ako scrypt hash v ${storePath} (mimo git).`)
}
