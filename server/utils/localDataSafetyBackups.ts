import { readdir, readFile, stat, unlink } from 'node:fs/promises'
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
import { isExportPayload } from './localDataExportPayload'

// This module owns listing, loading, downloading, and the two-step
// (preview then confirm) cleanup of automatically-created safety backups
// (the JSON snapshots written before every restore).

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

function resolveLocalDataBackupDirectory() {
  return join(
    process.env.RYBOLOV_LOCAL_DATA_DIR ?? join(process.cwd(), '.data', 'rybolov-cetin'),
    'backups',
  )
}

export function resolveLocalDataSafetyBackupDirectory() {
  return resolveLocalDataBackupDirectory()
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
    filePath: join(options.safetyBackupDirectory ?? resolveLocalDataBackupDirectory(), fileName),
    id: normalizedId,
  }
}

async function createSafetyBackupSummary(fileName: string, directory: string): Promise<LocalDataSafetyBackupSummary | null> {
  if (!isLocalDataSafetyBackupFileName(fileName)) return null

  const filePath = join(directory, fileName)
  const [fileStat, raw] = await Promise.all([
    stat(filePath),
    readFile(filePath, 'utf8'),
  ])
  let parsed: unknown

  try {
    parsed = JSON.parse(raw) as unknown
  }
  catch {
    return null
  }

  if (!isExportPayload(parsed)) return null

  return {
    assetFiles: parsed.totals.assetFiles,
    assetPolicy: parsed.assetPolicy,
    createdAt: parsed.exportedAt,
    exportId: parsed.exportId,
    fileName,
    id: fileName.slice(0, -'.json'.length),
    modifiedAt: fileStat.mtime.toISOString(),
    path: filePath,
    records: parsed.totals.records,
    sizeBytes: fileStat.size,
    stores: parsed.totals.stores,
  }
}

export async function listLocalDataSafetyBackups(
  options: LocalDataSafetyBackupArchiveOptions = {},
): Promise<LocalDataSafetyBackupSummary[]> {
  const directory = options.safetyBackupDirectory ?? resolveLocalDataBackupDirectory()
  let fileNames: string[]

  try {
    fileNames = await readdir(directory)
  }
  catch (error) {
    const maybeError = error as NodeJS.ErrnoException
    if (maybeError.code === 'ENOENT') return []

    throw error
  }

  const summaries = await Promise.all(
    fileNames
      .filter(isLocalDataSafetyBackupFileName)
      .map(async (fileName) => {
        try {
          return await createSafetyBackupSummary(fileName, directory)
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
    try {
      await unlink(backup.path)
      removedBackups.push(backup)
    }
    catch (error) {
      const maybeError = error as NodeJS.ErrnoException
      if (maybeError.code !== 'ENOENT') throw error
    }
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
  const [summary, raw] = await Promise.all([
    createSafetyBackupSummary(fileName, options.safetyBackupDirectory ?? resolveLocalDataBackupDirectory()),
    readFile(filePath, 'utf8'),
  ])

  if (!summary) {
    throw new Error('Safety backup sa nepodarilo načítať alebo nie je platný.')
  }

  const parsed: unknown = JSON.parse(raw)

  if (!isExportPayload(parsed)) {
    throw new Error('Safety backup nie je platný export Rybolov Cetín.')
  }

  return {
    fileName,
    filePath,
    payload: parsed,
    summary,
  }
}
