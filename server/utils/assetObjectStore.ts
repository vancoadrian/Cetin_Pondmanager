import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { atomicWriteFile } from './jsonFileStore'
import { getServerSupabaseClient } from './serverSupabaseClient'
import { resolveRuntimeStorageDriverKind } from './runtimeStorageDriver'

/**
 * Binary asset persistence (photos, logos, map backgrounds, backup files).
 * The Supabase driver stores objects in private Storage buckets accessed
 * exclusively through the server-side service client; the file driver keeps
 * the legacy `.data` directories as an explicit dev/test adapter.
 */

export const ASSET_BUCKETS = ['catch-photos', 'sponsor-assets', 'map-assets', 'data-backups'] as const

export type AssetBucket = (typeof ASSET_BUCKETS)[number]

export class AssetObjectNotFoundError extends Error {
  constructor(readonly bucket: AssetBucket, readonly objectName: string) {
    super(`Objekt "${objectName}" v buckete "${bucket}" neexistuje.`)
    this.name = 'AssetObjectNotFoundError'
  }
}

export class AssetObjectBackendError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message)
    this.name = 'AssetObjectBackendError'
  }
}

export interface AssetObjectSummary {
  name: string
  sizeBytes?: number
  updatedAt?: string
}

export interface AssetObjectOptions {
  /** File-driver directory override (dev/test adapter only); ignored by the Supabase driver. */
  fileDirectory?: string
}

function resolveLocalDataDirectoryRoot() {
  return process.env.RYBOLOV_LOCAL_DATA_DIR ?? join(process.cwd(), '.data', 'rybolov-cetin')
}

/** File-driver directory for one bucket, honoring the legacy env overrides. */
export function resolveAssetBucketFileDirectory(bucket: AssetBucket) {
  if (bucket === 'catch-photos') {
    return process.env.RYBOLOV_LOCAL_CATCH_PHOTO_DIR ?? join(resolveLocalDataDirectoryRoot(), 'catch-photos')
  }
  if (bucket === 'sponsor-assets') {
    return process.env.RYBOLOV_LOCAL_SPONSOR_ASSET_DIR ?? join(resolveLocalDataDirectoryRoot(), 'sponsor-assets')
  }
  if (bucket === 'map-assets') {
    return process.env.RYBOLOV_LOCAL_MAP_ASSET_DIR ?? join(resolveLocalDataDirectoryRoot(), 'map-assets')
  }

  return join(resolveLocalDataDirectoryRoot(), 'backups')
}

const contentTypesByExtension: Record<string, string> = {
  avif: 'image/avif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  json: 'application/json',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
}

export function guessAssetContentType(objectName: string) {
  const extension = objectName.split('.').pop()?.toLowerCase() ?? ''

  return contentTypesByExtension[extension]
}

function sanitizeObjectName(objectName: string) {
  const normalized = basename(objectName.trim())

  if (!normalized || normalized === '.' || normalized === '..') {
    throw new AssetObjectBackendError(`Neplatný názov objektu "${objectName}".`)
  }

  return normalized
}

function isStorageNotFound(error: { message?: string, status?: number | undefined }) {
  if (error.status === 404) return true

  return /not[_ ]?found/i.test(error.message ?? '')
}

function describeStorageError(error: { message?: string, status?: number | undefined }) {
  return error.status ? `${error.status}: ${error.message}` : error.message ?? 'neznáma chyba'
}

export async function writeAssetObject(
  bucket: AssetBucket,
  objectName: string,
  data: Uint8Array,
  contentType = guessAssetContentType(objectName) ?? 'application/octet-stream',
  options: AssetObjectOptions = {},
) {
  const name = sanitizeObjectName(objectName)

  if (resolveRuntimeStorageDriverKind() === 'file') {
    await atomicWriteFile(join(options.fileDirectory ?? resolveAssetBucketFileDirectory(bucket), name), data)

    return
  }

  const client = getServerSupabaseClient()
  const { error } = await client.storage.from(bucket).upload(name, data, {
    contentType,
    upsert: true,
  })

  if (error) {
    throw new AssetObjectBackendError(
      `Upload objektu "${name}" do bucketu "${bucket}" zlyhal (${describeStorageError(error)}).`,
      error,
    )
  }
}

export async function readAssetObject(
  bucket: AssetBucket,
  objectName: string,
  options: AssetObjectOptions = {},
): Promise<{ contentType?: string, data: Buffer }> {
  const name = sanitizeObjectName(objectName)

  if (resolveRuntimeStorageDriverKind() === 'file') {
    try {
      return {
        contentType: guessAssetContentType(name),
        data: await readFile(join(options.fileDirectory ?? resolveAssetBucketFileDirectory(bucket), name)),
      }
    }
    catch (error) {
      const maybeNodeError = error as NodeJS.ErrnoException
      if (maybeNodeError.code === 'ENOENT') throw new AssetObjectNotFoundError(bucket, name)

      throw error
    }
  }

  const client = getServerSupabaseClient()
  const { data, error } = await client.storage.from(bucket).download(name)

  if (error) {
    if (isStorageNotFound(error as { message?: string, status?: number })) {
      throw new AssetObjectNotFoundError(bucket, name)
    }

    throw new AssetObjectBackendError(
      `Čítanie objektu "${name}" z bucketu "${bucket}" zlyhalo (${describeStorageError(error as { message?: string })}).`,
      error,
    )
  }

  return {
    contentType: data.type || guessAssetContentType(name),
    data: Buffer.from(await data.arrayBuffer()),
  }
}

export async function removeAssetObject(bucket: AssetBucket, objectName: string, options: AssetObjectOptions = {}) {
  const name = sanitizeObjectName(objectName)

  if (resolveRuntimeStorageDriverKind() === 'file') {
    await rm(join(options.fileDirectory ?? resolveAssetBucketFileDirectory(bucket), name), { force: true })

    return
  }

  const client = getServerSupabaseClient()
  const { error } = await client.storage.from(bucket).remove([name])

  if (error && !isStorageNotFound(error as { message?: string, status?: number })) {
    throw new AssetObjectBackendError(
      `Zmazanie objektu "${name}" z bucketu "${bucket}" zlyhalo (${describeStorageError(error as { message?: string })}).`,
      error,
    )
  }
}

export async function listAssetObjects(
  bucket: AssetBucket,
  options: AssetObjectOptions = {},
): Promise<AssetObjectSummary[]> {
  if (resolveRuntimeStorageDriverKind() === 'file') {
    const directory = options.fileDirectory ?? resolveAssetBucketFileDirectory(bucket)
    let fileNames: string[]

    try {
      fileNames = await readdir(directory)
    }
    catch (error) {
      const maybeNodeError = error as NodeJS.ErrnoException
      if (maybeNodeError.code === 'ENOENT') return []

      throw error
    }

    const summaries = await Promise.all(fileNames.map(async (name): Promise<AssetObjectSummary | undefined> => {
      try {
        const fileStat = await stat(join(directory, name))
        if (!fileStat.isFile()) return undefined

        return {
          name,
          sizeBytes: fileStat.size,
          updatedAt: fileStat.mtime.toISOString(),
        }
      }
      catch {
        return undefined
      }
    }))

    return summaries.filter((summary): summary is AssetObjectSummary => summary !== undefined)
  }

  const client = getServerSupabaseClient()
  const pageSize = 1000
  const summaries: AssetObjectSummary[] = []

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.storage.from(bucket).list('', {
      limit: pageSize,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })

    if (error) {
      throw new AssetObjectBackendError(
        `Výpis bucketu "${bucket}" zlyhal (${describeStorageError(error as { message?: string })}).`,
        error,
      )
    }

    for (const item of data ?? []) {
      if (!item.name) continue
      const metadata = (item.metadata ?? {}) as { size?: number }
      summaries.push({
        name: item.name,
        sizeBytes: typeof metadata.size === 'number' ? metadata.size : undefined,
        updatedAt: item.updated_at ?? undefined,
      })
    }

    if (!data || data.length < pageSize) break
  }

  return summaries
}

/** Ensures the file-driver directory exists (used by the dev/test adapter only). */
export async function ensureAssetBucketFileDirectory(bucket: AssetBucket) {
  await mkdir(resolveAssetBucketFileDirectory(bucket), { recursive: true })
}

/** Lightweight reachability probe for the health endpoint. */
export async function probeAssetObjectBackend() {
  const client = getServerSupabaseClient()
  const { data, error } = await client.storage.listBuckets()

  if (error) {
    throw new AssetObjectBackendError(
      `Supabase Storage nie je dostupné (${describeStorageError(error as { message?: string })}).`,
      error,
    )
  }

  const bucketNames = new Set((data ?? []).map((bucket) => bucket.name))
  const missingBuckets = ASSET_BUCKETS.filter((bucket) => !bucketNames.has(bucket))

  return { missingBuckets }
}
