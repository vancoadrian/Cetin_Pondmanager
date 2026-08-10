import { basename, join } from 'node:path'
import type {
  LocalDataExportPayload,
  LocalDataImportPreviewResponse,
  LocalDataRestoreAssetResult,
  LocalDataRestoreResponse,
  LocalDataRestoreStoreResult,
} from '~/services/localDataExportService'
import { LOCAL_DATA_RESTORE_CONFIRMATION } from '~/services/localDataExportService'
import { atomicWriteFile, atomicWriteJsonFile } from './jsonFileStore'
import type { LocalDataAssetDefinition, LocalDataStoreDefinition } from './localDataExportPayload'
import {
  createLocalDataExportPayload,
  getDefaultLocalDataAssetDefinitions,
  getDefaultLocalDataStoreDefinitions,
  getExportDataSection,
  isExportPayload,
} from './localDataExportPayload'
import type { LocalDataImportPreviewOptions } from './localDataImportPreview'
import { createLocalDataImportPreview, hasRequiredFullData } from './localDataImportPreview'
import { resolveLocalDataSafetyBackupDirectory } from './localDataSafetyBackups'

// This module owns the actual destructive restore-from-backup logic:
// writing stores, writing inline assets, and requiring the confirmation
// phrase. It always writes a safety backup of the current state first.

export interface LocalDataRestoreOptions extends LocalDataImportPreviewOptions {
  allowWarnings?: boolean
  assetDefinitions?: LocalDataAssetDefinition[]
  confirmPhrase?: string
  restoredAt?: string
  restoreAssets?: boolean
  safetyBackupDirectory?: string
}

async function writeJsonFile(filePath: string, value: unknown) {
  await atomicWriteJsonFile(filePath, value)
}

async function writeSafetyBackup(
  restoredAt: string,
  options: Pick<LocalDataRestoreOptions, 'assetDefinitions' | 'safetyBackupDirectory' | 'storeDefinitions'>,
) {
  const payload = await createLocalDataExportPayload({
    assetDefinitions: options.assetDefinitions ?? getDefaultLocalDataAssetDefinitions(),
    assetPolicy: 'manifest',
    includeData: true,
    mode: 'full',
    storeDefinitions: options.storeDefinitions ?? getDefaultLocalDataStoreDefinitions(),
  })
  const filePath = join(
    options.safetyBackupDirectory ?? resolveLocalDataSafetyBackupDirectory(),
    `restore-safety-${restoredAt.slice(0, 19).replaceAll(':', '-')}.json`,
  )

  await writeJsonFile(filePath, payload)

  return filePath
}

async function restoreStores(
  payload: LocalDataExportPayload,
  storeDefinitions: LocalDataStoreDefinition[],
  preview: LocalDataImportPreviewResponse,
): Promise<LocalDataRestoreStoreResult[]> {
  const storeSummariesById = new Map(payload.stores.map((store) => [store.id, store]))
  const previewStoresById = new Map(preview.stores.map((store) => [store.id, store]))
  const restoredStores: LocalDataRestoreStoreResult[] = []

  for (const definition of storeDefinitions) {
    const dataSection = getExportDataSection(payload, definition.id)
    const summary = storeSummariesById.get(definition.id)
    const previewStore = previewStoresById.get(definition.id)

    if (!dataSection || !summary || previewStore?.status !== 'matched') continue

    await writeJsonFile(definition.path, dataSection)
    restoredStores.push({
      id: definition.id,
      label: definition.label,
      path: definition.path,
      recordCount: summary.recordCount,
    })
  }

  return restoredStores
}

async function restoreInlineAssets(
  payload: LocalDataExportPayload,
  assetDefinitions: LocalDataAssetDefinition[],
  restoreAssets: boolean,
): Promise<LocalDataRestoreAssetResult[]> {
  if (!restoreAssets || payload.assetPolicy !== 'inline') return []

  const assetDefinitionsById = new Map(assetDefinitions.map((definition) => [definition.id, definition]))
  const restoredAssets: LocalDataRestoreAssetResult[] = []

  for (const assetGroup of payload.assets) {
    const definition = assetDefinitionsById.get(assetGroup.id)
    if (!definition) continue

    let fileCount = 0
    let totalSizeBytes = 0

    for (const file of assetGroup.files) {
      if (!file.dataBase64) continue

      const fileBuffer = Buffer.from(file.dataBase64, 'base64')
      const filePath = join(definition.directory, basename(file.name))

      await atomicWriteFile(filePath, fileBuffer)
      fileCount += 1
      totalSizeBytes += fileBuffer.byteLength
    }

    if (fileCount > 0) {
      restoredAssets.push({
        directory: definition.directory,
        fileCount,
        id: definition.id,
        label: definition.label,
        totalSizeBytes,
      })
    }
  }

  return restoredAssets
}

export async function restoreLocalDataBackup(
  candidate: unknown,
  options: LocalDataRestoreOptions = {},
): Promise<LocalDataRestoreResponse> {
  if (options.confirmPhrase !== LOCAL_DATA_RESTORE_CONFIRMATION) {
    throw new Error(`Na obnovu je potrebné potvrdenie ${LOCAL_DATA_RESTORE_CONFIRMATION}.`)
  }

  if (!isExportPayload(candidate)) {
    throw new Error('Súbor nevyzerá ako JSON záloha Rybolov Cetín.')
  }

  const storeDefinitions = options.storeDefinitions ?? getDefaultLocalDataStoreDefinitions()
  const assetDefinitions = options.assetDefinitions ?? getDefaultLocalDataAssetDefinitions()
  const preview = await createLocalDataImportPreview(candidate, {
    currentPayload: options.currentPayload,
    storeDefinitions,
  })

  if (preview.status === 'invalid') {
    throw new Error('Backup nie je platný na obnovu.')
  }

  if (preview.status === 'warning' && !options.allowWarnings) {
    throw new Error('Backup má upozornenia. Obnova vyžaduje vedomé povolenie upozornení.')
  }

  if (!hasRequiredFullData(candidate)) {
    throw new Error('Backup neobsahuje dátové sekcie potrebné na obnovu.')
  }

  const restoredAt = options.restoredAt ?? new Date().toISOString()
  const safetyBackupPath = await writeSafetyBackup(restoredAt, {
    assetDefinitions,
    safetyBackupDirectory: options.safetyBackupDirectory,
    storeDefinitions,
  })
  const restoredStores = await restoreStores(candidate, storeDefinitions, preview)
  const restoredAssets = await restoreInlineAssets(candidate, assetDefinitions, options.restoreAssets ?? true)

  return {
    preview,
    restoredAssets,
    restoredAt,
    restoredStores,
    safetyBackupPath,
  }
}
