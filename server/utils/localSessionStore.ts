import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { MockRole } from '~/composables/useMockAuth'
import { atomicWriteJsonFile, withFileMutex } from './jsonFileStore'
import { getServerSupabaseClient } from './serverSupabaseClient'
import { resolveRuntimeStorageDriverKind } from './runtimeStorageDriver'

export interface LocalSessionRecord {
  accountId: string
  createdAt: string
  expiresAt: string
  role: MockRole
  tokenHash: string
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14

export const APP_SESSIONS_TABLE = 'app_sessions'

export function resolveLocalSessionStorePath() {
  return process.env.RYBOLOV_LOCAL_SESSION_STORE
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'session-state.json')
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function isValidSessionRecord(value: unknown): value is LocalSessionRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<LocalSessionRecord>
  return typeof record.accountId === 'string'
    && typeof record.createdAt === 'string'
    && typeof record.expiresAt === 'string'
    && typeof record.role === 'string'
    && typeof record.tokenHash === 'string'
}

function loadSessionsFromDiskSync(filePath: string): LocalSessionRecord[] {
  try {
    const raw = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as { sessions?: unknown }
    const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : []
    return sessions.filter(isValidSessionRecord)
  }
  catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException
    if (maybeNodeError?.code !== 'ENOENT') {
      console.warn(`Nepodarilo sa načítať session store, používam prázdny stav: ${maybeNodeError?.message ?? error}`)
    }
    return []
  }
}

function isExpired(record: LocalSessionRecord, now = Date.now()) {
  return new Date(record.expiresAt).getTime() <= now
}

function createSessionRecord(accountId: string, role: MockRole, ttlMs: number) {
  const token = randomBytes(32).toString('base64url')
  const now = Date.now()
  const record: LocalSessionRecord = {
    accountId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    role,
    tokenHash: hashSessionToken(token),
  }

  return { record, token }
}

/**
 * File-driver session cache (explicit dev/test adapter): an in-memory map
 * backed by a JSON file, mirroring the historical behavior.
 */
class LocalSessionCache {
  private byTokenHash: Map<string, LocalSessionRecord>

  constructor(private readonly filePath: string) {
    const sessions = loadSessionsFromDiskSync(filePath).filter((item) => !isExpired(item))
    this.byTokenHash = new Map(sessions.map((item) => [item.tokenHash, item]))
  }

  private persist() {
    return withFileMutex(this.filePath, () => atomicWriteJsonFile(this.filePath, {
      sessions: [...this.byTokenHash.values()],
      updatedAt: new Date().toISOString(),
      version: 1,
    }))
  }

  resolve(token: string | undefined | null): LocalSessionRecord | undefined {
    if (!token) return undefined
    const record = this.byTokenHash.get(hashSessionToken(token))
    if (!record) return undefined
    if (isExpired(record)) {
      this.byTokenHash.delete(record.tokenHash)
      void this.persist()
      return undefined
    }
    return record
  }

  async create(accountId: string, role: MockRole, ttlMs = SESSION_TTL_MS) {
    const created = createSessionRecord(accountId, role, ttlMs)
    this.byTokenHash.set(created.record.tokenHash, created.record)
    await this.persist()
    return created
  }

  async destroy(token: string | undefined | null) {
    if (!token) return
    if (this.byTokenHash.delete(hashSessionToken(token))) await this.persist()
  }

  async destroyAllForAccount(accountId: string) {
    let changed = false
    for (const [key, record] of this.byTokenHash) {
      if (record.accountId === accountId) {
        this.byTokenHash.delete(key)
        changed = true
      }
    }
    if (changed) await this.persist()
  }
}

const cachesByPath = new Map<string, LocalSessionCache>()

function getCache(filePath: string): LocalSessionCache {
  let cache = cachesByPath.get(filePath)
  if (!cache) {
    cache = new LocalSessionCache(filePath)
    cachesByPath.set(filePath, cache)
  }
  return cache
}

interface AppSessionRow {
  account_id: string
  created_at: string
  expires_at: string
  role: string
  token_hash: string
}

function toSessionRecord(row: AppSessionRow): LocalSessionRecord {
  return {
    accountId: row.account_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    role: row.role as MockRole,
    tokenHash: row.token_hash,
  }
}

function describeSupabaseError(error: { code?: string, message?: string }) {
  return error.code ? `${error.code}: ${error.message}` : error.message ?? 'neznáma chyba'
}

async function resolveSupabaseSession(token: string | undefined | null) {
  if (!token) return undefined
  const client = getServerSupabaseClient()
  const tokenHash = hashSessionToken(token)
  const { data, error } = await client
    .from(APP_SESSIONS_TABLE)
    .select('token_hash, account_id, role, created_at, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle<AppSessionRow>()

  if (error) {
    throw new Error(`Čítanie session zo Supabase zlyhalo (${describeSupabaseError(error)}).`)
  }
  if (!data) return undefined

  const record = toSessionRecord(data)
  if (isExpired(record)) {
    await client.from(APP_SESSIONS_TABLE).delete().eq('token_hash', tokenHash)
    return undefined
  }

  return record
}

/**
 * Resolves the session tied to an opaque cookie token. Sessions live in the
 * `app_sessions` table under the Supabase driver (authoritative across
 * server instances and restarts) and in the legacy JSON cache under the
 * file driver.
 */
export async function resolveLocalSession(
  token: string | undefined | null,
  filePath = resolveLocalSessionStorePath(),
): Promise<LocalSessionRecord | undefined> {
  if (resolveRuntimeStorageDriverKind() === 'file') {
    return getCache(filePath).resolve(token)
  }

  return resolveSupabaseSession(token)
}

export async function createLocalSession(
  accountId: string,
  role: MockRole,
  ttlMs = SESSION_TTL_MS,
  filePath = resolveLocalSessionStorePath(),
) {
  if (resolveRuntimeStorageDriverKind() === 'file') {
    return getCache(filePath).create(accountId, role, ttlMs)
  }

  const created = createSessionRecord(accountId, role, ttlMs)
  const client = getServerSupabaseClient()
  const { error } = await client.from(APP_SESSIONS_TABLE).insert({
    account_id: created.record.accountId,
    created_at: created.record.createdAt,
    expires_at: created.record.expiresAt,
    role: created.record.role,
    token_hash: created.record.tokenHash,
  })

  if (error) {
    throw new Error(`Vytvorenie session v Supabase zlyhalo (${describeSupabaseError(error)}).`)
  }

  return created
}

export async function destroyLocalSession(
  token: string | undefined | null,
  filePath = resolveLocalSessionStorePath(),
) {
  if (resolveRuntimeStorageDriverKind() === 'file') {
    await getCache(filePath).destroy(token)
    return
  }

  if (!token) return
  const client = getServerSupabaseClient()
  const { error } = await client
    .from(APP_SESSIONS_TABLE)
    .delete()
    .eq('token_hash', hashSessionToken(token))

  if (error) {
    throw new Error(`Zrušenie session v Supabase zlyhalo (${describeSupabaseError(error)}).`)
  }
}

export async function destroyAllLocalSessionsForAccount(
  accountId: string,
  filePath = resolveLocalSessionStorePath(),
) {
  if (resolveRuntimeStorageDriverKind() === 'file') {
    await getCache(filePath).destroyAllForAccount(accountId)
    return
  }

  const client = getServerSupabaseClient()
  const { error } = await client
    .from(APP_SESSIONS_TABLE)
    .delete()
    .eq('account_id', accountId)

  if (error) {
    throw new Error(`Zrušenie sessions účtu v Supabase zlyhalo (${describeSupabaseError(error)}).`)
  }
}
