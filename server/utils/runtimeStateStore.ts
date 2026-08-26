import { readFile } from 'node:fs/promises'
import { atomicWriteJsonFile, withFileMutex } from './jsonFileStore'
import { getServerSupabaseClient } from './serverSupabaseClient'
import { resolveRuntimeStorageDriverKind } from './runtimeStorageDriver'

/**
 * Persistence primitives for the runtime state documents (the former
 * `.data/rybolov-cetin/*.json` stores). The Supabase driver keeps every
 * document as a row in `public.runtime_store_states` (see the
 * 202608260001_runtime_state_sessions_and_buckets migration); the file
 * driver keeps the legacy JSON-file layout as an explicit dev/test adapter.
 *
 * Store modules keep their domain validation, seeding and normalization —
 * they only swap direct fs access for these primitives.
 */

export const RUNTIME_STORE_STATES_TABLE = 'runtime_store_states'

export class RuntimeStateBackendError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message)
    this.name = 'RuntimeStateBackendError'
  }
}

export type RuntimeDocumentReadResult =
  | { found: false }
  | { found: true, payload: unknown, revision: number }

interface SupabaseStoreRow {
  payload: unknown
  revision: number
}

function describeSupabaseError(error: { code?: string, message?: string }) {
  return error.code ? `${error.code}: ${error.message}` : error.message ?? 'neznáma chyba'
}

async function readSupabaseDocument(key: string): Promise<RuntimeDocumentReadResult> {
  const client = getServerSupabaseClient()
  const { data, error } = await client
    .from(RUNTIME_STORE_STATES_TABLE)
    .select('payload, revision')
    .eq('name', key)
    .maybeSingle<SupabaseStoreRow>()

  if (error) {
    throw new RuntimeStateBackendError(
      `Čítanie runtime stavu "${key}" zo Supabase zlyhalo (${describeSupabaseError(error)}).`,
      error,
    )
  }

  if (!data) return { found: false }

  return { found: true, payload: data.payload, revision: data.revision }
}

async function writeSupabaseDocument(key: string, payload: unknown) {
  const client = getServerSupabaseClient()
  const { error } = await client.rpc('runtime_store_upsert', {
    store_name: key,
    store_payload: payload,
  })

  if (error) {
    throw new RuntimeStateBackendError(
      `Zápis runtime stavu "${key}" do Supabase zlyhal (${describeSupabaseError(error)}).`,
      error,
    )
  }
}

async function writeSupabaseDocumentIfRevision(key: string, payload: unknown, expectedRevision: number | null) {
  const client = getServerSupabaseClient()
  const { data, error } = await client.rpc('runtime_store_compare_and_set', {
    expected_revision: expectedRevision,
    store_name: key,
    store_payload: payload,
  })

  if (error) {
    throw new RuntimeStateBackendError(
      `Podmienený zápis runtime stavu "${key}" do Supabase zlyhal (${describeSupabaseError(error)}).`,
      error,
    )
  }

  return data === true
}

async function readFileDocument(filePath: string): Promise<RuntimeDocumentReadResult> {
  try {
    const raw = await readFile(filePath, 'utf8')

    return { found: true, payload: JSON.parse(raw) as unknown, revision: 0 }
  }
  catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException
    if (maybeNodeError.code !== 'ENOENT') {
      console.warn(`Nepodarilo sa načítať lokálny store ${filePath}: ${maybeNodeError.message}`)
    }

    return { found: false }
  }
}

/**
 * Reads one runtime document. `key` addresses the Supabase row, `filePath`
 * addresses the file-driver location (and keeps the historical per-test
 * path-override contract intact).
 */
export async function readRuntimeDocument(key: string, filePath: string): Promise<RuntimeDocumentReadResult> {
  if (resolveRuntimeStorageDriverKind() === 'file') return readFileDocument(filePath)

  return readSupabaseDocument(key)
}

/** Unconditionally persists one runtime document (last write wins). */
export async function writeRuntimeDocument(key: string, filePath: string, payload: unknown) {
  if (resolveRuntimeStorageDriverKind() === 'file') {
    await atomicWriteJsonFile(filePath, payload)

    return
  }

  await writeSupabaseDocument(key, payload)
}

function runtimeMutexKey(key: string, filePath: string) {
  return resolveRuntimeStorageDriverKind() === 'file' ? filePath : `runtime-store:${key}`
}

/**
 * Serializes read-modify-write sequences against one document. Within the
 * process it reuses the keyed mutex; across instances the Supabase driver
 * additionally guards the write with a compare-and-set on the document
 * revision and retries the whole mutation on a lost race.
 */
export async function mutateRuntimeDocument<T>(
  key: string,
  filePath: string,
  task: (current: RuntimeDocumentReadResult) => Promise<{ payload?: unknown, result: T }>,
): Promise<T> {
  return withFileMutex(runtimeMutexKey(key, filePath), async () => {
    if (resolveRuntimeStorageDriverKind() === 'file') {
      const current = await readFileDocument(filePath)
      const next = await task(current)
      if (next.payload !== undefined) await atomicWriteJsonFile(filePath, next.payload)

      return next.result
    }

    const maxAttempts = 5
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const current = await readSupabaseDocument(key)
      const next = await task(current)
      if (next.payload === undefined) return next.result

      const expectedRevision = current.found ? current.revision : null
      if (await writeSupabaseDocumentIfRevision(key, next.payload, expectedRevision)) {
        return next.result
      }
    }

    throw new RuntimeStateBackendError(
      `Mutácia runtime stavu "${key}" opakovane prehráva súbeh zápisov, skús akciu zopakovať.`,
    )
  })
}

/**
 * Invalid persisted shape handling: the file adapter keeps the historical
 * "reseed silently" behavior, but the Supabase driver must never overwrite
 * potentially real production data with seeds — it fails loudly instead.
 */
export function guardCorruptRuntimeState(key: string): void {
  if (resolveRuntimeStorageDriverKind() === 'supabase') {
    throw new RuntimeStateBackendError(
      `Runtime stav "${key}" v Supabase má neplatný formát. Skontroluj obsah tabuľky runtime_store_states `
      + `alebo ho obnov importom (pnpm data:import) — automatické preseedovanie je v Supabase drivri zakázané.`,
    )
  }
}

/** Lightweight reachability probe for the health endpoint. */
export async function probeRuntimeStateBackend() {
  const client = getServerSupabaseClient()
  const { count, error } = await client
    .from(RUNTIME_STORE_STATES_TABLE)
    .select('name', { count: 'exact', head: true })

  if (error) {
    throw new RuntimeStateBackendError(
      `Supabase runtime store nie je dostupný (${describeSupabaseError(error)}).`,
      error,
    )
  }

  return { documentCount: count ?? 0 }
}
