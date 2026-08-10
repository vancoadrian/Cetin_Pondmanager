import type {
  LocalDataExportIntegrity,
  LocalDataExportPayload,
  LocalDataImportPreviewIssue,
  LocalDataImportPreviewResponse,
  LocalDataImportPreviewStore,
} from '~/services/localDataExportService'
import {
  createLocalDataExportPayload,
  createLocalDataPayloadChecksum,
  createStoreCounts,
  getDefaultLocalDataStoreDefinitions,
  getExportDataSection,
  getStoreRecordCount,
  isExportPayload,
  isRecord,
} from './localDataExportPayload'
import type { LocalDataStoreDefinition } from './localDataExportPayload'

// This module owns the "preview before restore" path: validating an
// uploaded backup against the current store model, non-destructively, and
// returning warnings/issues for the admin UI to review before restoring.

export interface LocalDataImportPreviewOptions {
  currentPayload?: LocalDataExportPayload
  storeDefinitions?: LocalDataStoreDefinition[]
}

function isLocalDataExportIntegrity(value: unknown): value is LocalDataExportIntegrity {
  const candidate = value as Partial<LocalDataExportIntegrity>

  return (
    isRecord(value) &&
    candidate.algorithm === 'sha256' &&
    typeof candidate.checksum === 'string' &&
    typeof candidate.generatedAt === 'string' &&
    candidate.scope === 'payload-v1'
  )
}

function createEmptyImportPreview(status: LocalDataImportPreviewResponse['status'], issues: LocalDataImportPreviewIssue[]): LocalDataImportPreviewResponse {
  return {
    assets: [],
    issues,
    status,
    stores: [],
    totals: {
      assetFiles: 0,
      assetSizeBytes: 0,
      records: 0,
      stores: 0,
    },
  }
}

function normalizeTotals(value: unknown) {
  if (!isRecord(value)) {
    return {
      assetFiles: 0,
      assetSizeBytes: 0,
      records: 0,
      stores: 0,
    }
  }

  return {
    assetFiles: typeof value.assetFiles === 'number' ? value.assetFiles : 0,
    assetSizeBytes: typeof value.assetSizeBytes === 'number' ? value.assetSizeBytes : 0,
    records: typeof value.records === 'number' ? value.records : 0,
    stores: typeof value.stores === 'number' ? value.stores : 0,
  }
}

function getPayloadRecordCount(payload: LocalDataExportPayload) {
  return payload.stores.reduce((sum, store) => sum + store.recordCount, 0)
}

function getPayloadAssetFileCount(payload: LocalDataExportPayload) {
  return payload.assets.reduce((sum, asset) => sum + asset.fileCount, 0)
}

function getPayloadAssetSize(payload: LocalDataExportPayload) {
  return payload.assets.reduce((sum, asset) => sum + asset.totalSizeBytes, 0)
}

function createStorePreviewRows(
  payload: LocalDataExportPayload,
  currentPayload: LocalDataExportPayload,
  storeDefinitions: LocalDataStoreDefinition[],
): LocalDataImportPreviewStore[] {
  const expectedDefinitionsById = new Map(storeDefinitions.map((definition) => [definition.id, definition]))
  const currentStoresById = new Map(currentPayload.stores.map((store) => [store.id, store]))
  const incomingStoresById = new Map(payload.stores.map((store) => [store.id, store]))
  const ids = Array.from(new Set([
    ...storeDefinitions.map((definition) => definition.id),
    ...payload.stores.map((store) => store.id),
  ]))

  return ids.map((id) => {
    const definition = expectedDefinitionsById.get(id)
    const incomingStore = incomingStoresById.get(id)
    const currentStore = currentStoresById.get(id)

    return {
      currentRecordCount: currentStore?.recordCount,
      id,
      incomingRecordCount: incomingStore?.recordCount ?? 0,
      label: incomingStore?.label ?? definition?.label ?? id,
      status: !definition ? 'extra' : incomingStore ? 'matched' : 'missing',
    }
  })
}

export function hasRequiredFullData(payload: LocalDataExportPayload) {
  return payload.mode === 'full' && isRecord(payload.data)
}

function createIntegrityPreview(payload: LocalDataExportPayload): NonNullable<LocalDataImportPreviewResponse['integrity']> {
  if (!isLocalDataExportIntegrity(payload.integrity)) {
    return { status: 'missing' }
  }

  const expectedChecksum = createLocalDataPayloadChecksum(payload)

  return {
    algorithm: payload.integrity.algorithm,
    checksum: payload.integrity.checksum,
    expectedChecksum,
    status: payload.integrity.checksum === expectedChecksum ? 'verified' : 'mismatch',
  }
}

export async function createLocalDataImportPreview(
  candidate: unknown,
  options: LocalDataImportPreviewOptions = {},
): Promise<LocalDataImportPreviewResponse> {
  const issues: LocalDataImportPreviewIssue[] = []

  if (!isExportPayload(candidate)) {
    return createEmptyImportPreview('invalid', [
      {
        code: 'invalid_payload',
        message: 'Súbor nevyzerá ako JSON záloha Rybolov Cetín.',
        severity: 'error',
      },
    ])
  }

  const payload = candidate
  const storeDefinitions = options.storeDefinitions ?? getDefaultLocalDataStoreDefinitions()
  const currentPayload = options.currentPayload ?? await createLocalDataExportPayload({
    assetPolicy: 'manifest',
    includeData: false,
    mode: 'summary',
    storeDefinitions,
  })
  const totals = normalizeTotals(payload.totals)
  const stores = createStorePreviewRows(payload, currentPayload, storeDefinitions)
  const integrity = createIntegrityPreview(payload)

  if (payload.version !== 1) {
    issues.push({
      code: 'unsupported_version',
      message: `Záloha má nepodporovanú verziu ${payload.version}.`,
      severity: 'error',
    })
  }

  if (payload.service !== 'Rybolov Cetín') {
    issues.push({
      code: 'wrong_service',
      message: 'Záloha nie je označená ako export služby Rybolov Cetín.',
      severity: 'error',
    })
  }

  if (integrity.status === 'mismatch') {
    issues.push({
      code: 'integrity_checksum_mismatch',
      message: 'Kontrolný odtlačok zálohy nesedí. Súbor bol po exporte zmenený alebo poškodený.',
      severity: 'error',
    })
  }

  if (!hasRequiredFullData(payload)) {
    issues.push({
      code: 'summary_without_data',
      message: 'Súbor je iba súhrn alebo neobsahuje dátové sekcie; dá sa skontrolovať, ale nedá sa použiť na obnovu dát.',
      severity: 'warning',
    })
  }

  for (const store of stores) {
    if (store.status === 'missing') {
      issues.push({
        code: `missing_store_${store.id}`,
        message: `Backup neobsahuje očakávaný store ${store.label}.`,
        severity: 'warning',
      })
    }

    if (store.status === 'extra') {
      issues.push({
        code: `extra_store_${store.id}`,
        message: `Backup obsahuje neznámy store ${store.label}; import ho zatiaľ nebude vedieť bezpečne obnoviť.`,
        severity: 'warning',
      })
    }

    const incomingStore = payload.stores.find((item) => item.id === store.id)
    const dataSection = getExportDataSection(payload, store.id)

    if (hasRequiredFullData(payload) && incomingStore && store.status !== 'extra' && !dataSection) {
      issues.push({
        code: `missing_data_${store.id}`,
        message: `Backup má store ${store.label} v manifeste, ale chýba mu dátová sekcia.`,
        severity: 'error',
      })
    }

    if (incomingStore && dataSection) {
      const dataRecordCount = getStoreRecordCount(createStoreCounts(dataSection))
      if (incomingStore.recordCount !== dataRecordCount) {
        issues.push({
          code: `store_data_count_mismatch_${store.id}`,
          message: `Store ${store.label} má v manifeste ${incomingStore.recordCount} záznamov, ale dátová sekcia obsahuje ${dataRecordCount}.`,
          severity: 'warning',
        })
      }
    }
  }

  if (totals.stores !== payload.stores.length) {
    issues.push({
      code: 'store_total_mismatch',
      message: `Súčet store v metadátach (${totals.stores}) nesedí so zoznamom store (${payload.stores.length}).`,
      severity: 'warning',
    })
  }

  const recordCount = getPayloadRecordCount(payload)
  if (totals.records !== recordCount) {
    issues.push({
      code: 'record_total_mismatch',
      message: `Súčet záznamov v metadátach (${totals.records}) nesedí so súčtom store (${recordCount}).`,
      severity: 'warning',
    })
  }

  const assetFileCount = getPayloadAssetFileCount(payload)
  if (totals.assetFiles !== assetFileCount) {
    issues.push({
      code: 'asset_file_total_mismatch',
      message: `Súčet asset súborov v metadátach (${totals.assetFiles}) nesedí so zoznamom assetov (${assetFileCount}).`,
      severity: 'warning',
    })
  }

  const assetSize = getPayloadAssetSize(payload)
  if (totals.assetSizeBytes !== assetSize) {
    issues.push({
      code: 'asset_size_total_mismatch',
      message: `Veľkosť assetov v metadátach (${totals.assetSizeBytes} B) nesedí so súčtom assetov (${assetSize} B).`,
      severity: 'warning',
    })
  }

  if (payload.assetPolicy === 'manifest' && payload.totals.assetFiles > 0) {
    issues.push({
      code: 'manifest_assets',
      message: 'Backup obsahuje iba manifest assetov; obrázky a logá treba pri obnove preniesť samostatne.',
      severity: 'info',
    })
  }

  const hasErrors = issues.some((issue) => issue.severity === 'error')
  const hasWarnings = issues.some((issue) => issue.severity === 'warning')

  return {
    assetPolicy: payload.assetPolicy,
    assets: payload.assets,
    exportedAt: payload.exportedAt,
    exportId: payload.exportId,
    integrity,
    issues,
    mode: payload.mode,
    status: hasErrors ? 'invalid' : hasWarnings ? 'warning' : 'ready',
    stores,
    totals,
    version: payload.version,
  }
}
