import { join } from 'node:path'
import type {
  LocalDataExportPayload,
  LocalDataSafetyBackupCleanupPreview,
  LocalDataSafetyBackupSummary,
} from '~/services/localDataExportService'
import {
  LOCAL_DATA_BACKUP_CLEANUP_DEFAULT_KEEP_RECENT,
  LOCAL_DATA_BACKUP_CLEANUP_MAX_KEEP_RECENT,
  LOCAL_DATA_BACKUP_CLEANUP_MIN_KEEP_RECENT,
} from '~/services/localDataExportService'
import {
  listAssetObjects,
  readAssetObject,
  removeAssetObject,
  resolveAssetBucketFileDirectory,
} from './assetObjectStore'
import { isExportPayload } from './localDataExportPayload'

// This module owns listing, loading, downloading, and the two-step
// (preview then confirm) cleanup of automatically-created safety backups
// (the JSON snapshots written before every restore). Backups live in the
// private `data-backups` Storage bucket under the Supabase driver and in
// the legacy backups directory under the file driver.

const SAFETY_BACKUP_BUCKET = 'data-backups'

export interface LocalDataSafetyBackupArchiveOptions {
  limit?: number
  safetyBackupDirectory?: string
}

export interface LocalDataSafetyBackupReadOptions {
  safetyBackupDirectory?: string
}

export interface LocalDataSafetyBackupCleanupOptions {
  keepRecent?: number
  safetyBackupDirectory?: string
}

export interface LocalDataSafetyBackupFile {
  fileName: string
  filePath: string
  payload: LocalDataExportPayload
  summary: LocalDataSafetyBackupSummary
}

export function resolveLocalDataSafetyBackupDirectory() {
  return resolveAssetBucketFileDirectory(SAFETY_BACKUP_BUCKET)
}

function isLocalDataSafetyBackupFileName(value: string) {
  return /^restore-safety-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/.test(value)
}

function normalizeLocalDataSafetyBackupId(value: string) {
  const raw = value.endsWith('.json') ? value.slice(0, -'.json'.length) : value

  if (!/^restore-safety-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error('Neplatný identifikátor safety backupu.')
  }

  return raw
}

function resolveLocalDataSafetyBackupPath(id: string, options: LocalDataSafetyBackupReadOptions = {}) {
  const normalizedId = normalizeLocalDataSafetyBackupId(id)
  const fileName = `${normalizedId}.json`

  return {
    fileName,
    filePath: join(options.safetyBackupDirectory ?? resolveLocalDataSafetyBackupDirectory(), fileName),
    id: normalizedId,
  }
}

async function loadSafetyBackupFile(
  fileName: string,
  fileDirectory?: string,
): Promise<{ payload: LocalDataExportPayload, sizeBytes: number, updatedAt?: string } | null> {
  if (!isLocalDataSafetyBackupFileName(fileName)) return null

  let raw: Buffer
  try {
    raw = (await readAssetObject(SAFETY_BACKUP_BUCKET, fileName, { fileDirectory })).data
  }
  catch {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.toString('utf8')) as unknown
  }
  catch {
    return null
  }

  if (!isExportPayload(parsed)) return null

  return {
    payload: parsed,
    sizeBytes: raw.byteLength,
  }
}

function createSafetyBackupSummary(
  fileName: string,
  payload: LocalDataExportPayload,
  sizeBytes: number,
  modifiedAt: string | undefined,
  options: LocalDataSafetyBackupReadOptions = {},
): LocalDataSafetyBackupSummary {
  return {
    assetFiles: payload.totals.assetFiles,
    assetPolicy: payload.assetPolicy,
    createdAt: payload.exportedAt,
    exportId: payload.exportId,
    fileName,
    id: fileName.slice(0, -'.json'.length),
    modifiedAt: modifiedAt ?? payload.exportedAt,
    path: join(options.safetyBackupDirectory ?? resolveLocalDataSafetyBackupDirectory(), fileName),
    records: payload.totals.records,
    sizeBytes,
    stores: payload.totals.stores,
  }
}

export async function listLocalDataSafetyBackups(
  options: LocalDataSafetyBackupArchiveOptions = {},
): Promise<LocalDataSafetyBackupSummary[]> {
  const objects = await listAssetObjects(SAFETY_BACKUP_BUCKET, { fileDirectory: options.safetyBackupDirectory })
  const summaries = await Promise.all(
    objects
      .filter((object) => isLocalDataSafetyBackupFileName(object.name))
      .map(async (object) => {
        try {
          const file = await loadSafetyBackupFile(object.name, options.safetyBackupDirectory)
          if (!file) return null

          return createSafetyBackupSummary(object.name, file.payload, file.sizeBytes, object.updatedAt, options)
        }
        catch {
          return null
        }
      }),
  )

  return summaries
    .filter((summary): summary is LocalDataSafetyBackupSummary => summary !== null)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, Math.max(1, options.limit ?? summaries.length))
}

export function normalizeLocalDataSafetyBackupKeepRecent(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(parsed)) return LOCAL_DATA_BACKUP_CLEANUP_DEFAULT_KEEP_RECENT

  return Math.min(
    LOCAL_DATA_BACKUP_CLEANUP_MAX_KEEP_RECENT,
    Math.max(LOCAL_DATA_BACKUP_CLEANUP_MIN_KEEP_RECENT, Math.trunc(parsed)),
  )
}

export async function previewLocalDataSafetyBackupCleanup(
  options: LocalDataSafetyBackupCleanupOptions = {},
): Promise<LocalDataSafetyBackupCleanupPreview> {
  const keepRecent = normalizeLocalDataSafetyBackupKeepRecent(options.keepRecent)
  const backups = await listLocalDataSafetyBackups({
    limit: Number.MAX_SAFE_INTEGER,
    safetyBackupDirectory: options.safetyBackupDirectory,
  })
  const retainedBackups = backups.slice(0, keepRecent)
  const removableBackups = backups.slice(keepRecent)

  return {
    candidateCount: backups.length,
    keepRecent,
    removableBackups,
    removableSizeBytes: removableBackups.reduce((sum, backup) => sum + backup.sizeBytes, 0),
    retainedBackups,
  }
}

export async function cleanupLocalDataSafetyBackups(
  options: LocalDataSafetyBackupCleanupOptions = {},
): Promise<LocalDataSafetyBackupCleanupPreview> {
  const preview = await previewLocalDataSafetyBackupCleanup(options)
  const removedBackups: LocalDataSafetyBackupSummary[] = []

  for (const backup of preview.removableBackups) {
    await removeAssetObject(SAFETY_BACKUP_BUCKET, backup.fileName, { fileDirectory: options.safetyBackupDirectory })
    removedBackups.push(backup)
  }
  const nextPreview = await previewLocalDataSafetyBackupCleanup(options)

  return {
    ...nextPreview,
    removedBackups,
    removedSizeBytes: removedBackups.reduce((sum, backup) => sum + backup.sizeBytes, 0),
  }
}

export async function readLocalDataSafetyBackup(
  id: string,
  options: LocalDataSafetyBackupReadOptions = {},
): Promise<LocalDataSafetyBackupFile> {
  const { fileName, filePath } = resolveLocalDataSafetyBackupPath(id, options)
  const file = await loadSafetyBackupFile(fileName, options.safetyBackupDirectory)

  if (!file) {
    throw new Error('Safety backup sa nepodarilo načítať alebo nie je platný.')
  }

  return {
    fileName,
    filePath,
    payload: file.payload,
    summary: createSafetyBackupSummary(fileName, file.payload, file.sizeBytes, file.updatedAt, options),
  }
}
