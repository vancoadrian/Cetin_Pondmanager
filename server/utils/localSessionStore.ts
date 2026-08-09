import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { MockRole } from '~/composables/useMockAuth'
import { atomicWriteJsonFile, withFileMutex } from './jsonFileStore'

export interface LocalSessionRecord {
  accountId: string
  createdAt: string
  expiresAt: string
  role: MockRole
  tokenHash: string
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14

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

/**
 * In-memory, synchronously-readable session cache backed by a JSON file.
 * Sessions are looked up on every request, so resolution must stay
 * synchronous (see resolveAppSessionUser and its callers); mutations
 * (create/destroy) are async and persist through the atomic-write helper.
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
    const token = randomBytes(32).toString('base64url')
    const now = Date.now()
    const record: LocalSessionRecord = {
      accountId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString(),
      role,
      tokenHash: hashSessionToken(token),
    }
    this.byTokenHash.set(record.tokenHash, record)
    await this.persist()
    return { record, token }
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

export function resolveLocalSession(
  token: string | undefined | null,
  filePath = resolveLocalSessionStorePath(),
): LocalSessionRecord | undefined {
  return getCache(filePath).resolve(token)
}

export async function createLocalSession(
  accountId: string,
  role: MockRole,
  ttlMs?: number,
  filePath = resolveLocalSessionStorePath(),
) {
  return getCache(filePath).create(accountId, role, ttlMs)
}

export async function destroyLocalSession(
  token: string | undefined | null,
  filePath = resolveLocalSessionStorePath(),
) {
  await getCache(filePath).destroy(token)
}

export async function destroyAllLocalSessionsForAccount(
  accountId: string,
  filePath = resolveLocalSessionStorePath(),
) {
  await getCache(filePath).destroyAllForAccount(accountId)
}
