import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type {
  LocalDataExportIntegrity,
  LocalDataRestoreAssetResult,
  LocalDataRestoreResponse,
  LocalDataRestoreStoreResult,
  LocalDataSafetyBackupCleanupPreview,
  LocalDataSafetyBackupSummary,
  LocalDataExportAssetFile,
  LocalDataExportAssetPolicy,
  LocalDataExportAssetSummary,
  LocalDataExportCount,
  LocalDataExportMode,
  LocalDataExportPayload,
  LocalDataExportStoreSummary,
  LocalDataExportTotals,
  LocalDataImportPreviewIssue,
  LocalDataImportPreviewResponse,
  LocalDataImportPreviewStore,
} from '~/services/localDataExportService'
import {
  LOCAL_DATA_BACKUP_CLEANUP_DEFAULT_KEEP_RECENT,
  LOCAL_DATA_BACKUP_CLEANUP_MAX_KEEP_RECENT,
  LOCAL_DATA_BACKUP_CLEANUP_MIN_KEEP_RECENT,
  LOCAL_DATA_RESTORE_CONFIRMATION,
} from '~/services/localDataExportService'
import { readLocalAuditLogState, resolveLocalAuditLogStorePath } from './localAuditLogStore'
import { readLocalCabinCatalogState, resolveLocalCabinCatalogStorePath } from './localCabinCatalogStore'
import { resolveLocalCatchPhotoDir } from './localCatchPhotoStore'
import { readLocalCatchReportState, resolveLocalCatchReportStorePath } from './localCatchReportStore'
import { readLocalCatchState, resolveLocalCatchStorePath } from './localCatchStore'
import { readLocalClosureState, resolveLocalClosureStorePath } from './localClosureStore'
import { readLocalErrorLogState, resolveLocalErrorLogStorePath } from './localErrorLogStore'
import { resolveLocalMapAssetDir } from './localMapAssetStore'
import {
  readLocalMapDraftState,
  readLocalMapState,
  resolveLocalMapDraftStorePath,
  resolveLocalMapStorePath,
} from './localMapStore'
import { readLocalNotificationState, resolveLocalNotificationStorePath } from './localNotificationStore'
import { readLocalPaymentMethodState, resolveLocalPaymentMethodStorePath } from './localPaymentMethodStore'
import { readLocalRentalCatalogState, resolveLocalRentalCatalogStorePath } from './localRentalCatalogStore'
import { readLocalReservationState, resolveLocalReservationStorePath } from './localReservationStore'
import { resolveLocalSponsorAssetDir } from './localSponsorAssetStore'
import { readLocalSponsorState, resolveLocalSponsorStorePath } from './localSponsorStore'
import { readLocalTournamentState, resolveLocalTournamentStorePath } from './localTournamentStore'

type LocalDataExportState = Record<string, unknown>

export interface LocalDataStoreDefinition {
  countLabels?: Record<string, string>
  id: string
  label: string
  path: string
  read: () => Promise<LocalDataExportState>
}

export interface LocalDataAssetDefinition {
  directory: string
  id: string
  label: string
}

export interface LocalDataExportOptions {
  assetDefinitions?: LocalDataAssetDefinition[]
  assetPolicy?: LocalDataExportAssetPolicy
  exportedAt?: string
  includeData?: boolean
  mode?: LocalDataExportMode
  storeDefinitions?: LocalDataStoreDefinition[]
}

export interface LocalDataImportPreviewOptions {
  currentPayload?: LocalDataExportPayload
  storeDefinitions?: LocalDataStoreDefinition[]
}

export interface LocalDataRestoreOptions extends LocalDataImportPreviewOptions {
  allowWarnings?: boolean
  assetDefinitions?: LocalDataAssetDefinition[]
  confirmPhrase?: string
  restoredAt?: string
  restoreAssets?: boolean
  safetyBackupDirectory?: string
}

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

const defaultCountLabels: Record<string, string> = {
  alerts: 'Oznamy',
  broadcasts: 'Broadcasty',
  cabinProducts: 'Chaty',
  catchPhotos: 'Fotky v databáze',
  catches: 'Úlovky',
  deliveryLogs: 'Doručenia',
  errors: 'Chyby',
  events: 'Audit udalosti',
  lakeClosures: 'Uzávierky',
  mapFacilities: 'Servisné body',
  mapLayers: 'Vrstvy mapy',
  mapShapes: 'Polygony mapy',
  paymentMethods: 'Platobné metódy',
  pegs: 'Lovné miesta',
  rentalBookings: 'Rezervácie výbavy',
  rentalItems: 'Požičovňa',
  reservationExtras: 'Doplnky',
  reservations: 'Rezervácie',
  savedReports: 'Uložené reporty',
  sponsors: 'Sponzori',
  subscriptions: 'Push odbery',
  tournamentCatches: 'Súťažné úlovky',
  tournamentMarshals: 'Kontrolóri',
  tournamentPenalties: 'Tresty',
  tournamentRequests: 'Hlásenia tímov',
  tournamentRuleChecks: 'Kontroly pravidiel',
  tournamentTeamRegistrations: 'Prihlášky tímov',
  tournaments: 'Súťaže',
  tripLogbookEntries: 'Zápisy výprav',
  tripLogbooks: 'Zápisníky výprav',
}

export function getDefaultLocalDataStoreDefinitions(): LocalDataStoreDefinition[] {
  return [
    {
      id: 'reservations',
      label: 'Rezervácie a obsadenosť',
      path: resolveLocalReservationStorePath(),
      read: () => toExportState(readLocalReservationState()),
    },
    {
      id: 'paymentMethods',
      label: 'Platobné metódy',
      path: resolveLocalPaymentMethodStorePath(),
      read: () => toExportState(readLocalPaymentMethodState()),
    },
    {
      id: 'rentalCatalog',
      label: 'Požičovňa a doplnky',
      path: resolveLocalRentalCatalogStorePath(),
      read: () => toExportState(readLocalRentalCatalogState()),
    },
    {
      id: 'cabinCatalog',
      label: 'Cenník chát',
      path: resolveLocalCabinCatalogStorePath(),
      read: () => toExportState(readLocalCabinCatalogState()),
    },
    {
      id: 'sponsors',
      label: 'Sponzori',
      path: resolveLocalSponsorStorePath(),
      read: () => toExportState(readLocalSponsorState()),
    },
    {
      id: 'map',
      label: 'Mapa revíru',
      path: resolveLocalMapStorePath(),
      read: () => toExportState(readLocalMapState()),
    },
    {
      id: 'mapDraft',
      label: 'Rozpracovaná mapa revíru',
      path: resolveLocalMapDraftStorePath(),
      read: async () => toExportState(readLocalMapDraftState(undefined, await readLocalMapState())),
    },
    {
      id: 'closures',
      label: 'Uzávierky a sezóny',
      path: resolveLocalClosureStorePath(),
      read: () => toExportState(readLocalClosureState()),
    },
    {
      id: 'catches',
      label: 'Úlovky a zápisníky',
      path: resolveLocalCatchStorePath(),
      read: () => toExportState(readLocalCatchState()),
    },
    {
      id: 'catchReports',
      label: 'Uložené reporty úlovkov',
      path: resolveLocalCatchReportStorePath(),
      read: () => toExportState(readLocalCatchReportState()),
    },
    {
      id: 'tournaments',
      label: 'Súťažný dispečing',
      path: resolveLocalTournamentStorePath(),
      read: () => toExportState(readLocalTournamentState()),
    },
    {
      id: 'notifications',
      label: 'Notifikácie a odbery',
      path: resolveLocalNotificationStorePath(),
      read: () => toExportState(readLocalNotificationState()),
    },
    {
      id: 'auditLog',
      label: 'Audit log',
      path: resolveLocalAuditLogStorePath(),
      read: () => toExportState(readLocalAuditLogState()),
    },
    {
      id: 'errorLog',
      label: 'Error log',
      path: resolveLocalErrorLogStorePath(),
      read: () => toExportState(readLocalErrorLogState()),
    },
  ]
}

export function getDefaultLocalDataAssetDefinitions(): LocalDataAssetDefinition[] {
  return [
    {
      directory: resolveLocalCatchPhotoDir(),
      id: 'catchPhotos',
      label: 'Fotky úlovkov',
    },
    {
      directory: resolveLocalMapAssetDir(),
      id: 'mapAssets',
      label: 'Podklady máp',
    },
    {
      directory: resolveLocalSponsorAssetDir(),
      id: 'sponsorAssets',
      label: 'Logá sponzorov',
    },
  ]
}

export function normalizeLocalDataExportAssetPolicy(value: unknown): LocalDataExportAssetPolicy {
  if (value === 'inline' || value === 'none') return value

  return 'manifest'
}

export function normalizeLocalDataExportMode(value: unknown): LocalDataExportMode {
  return value === 'summary' ? 'summary' : 'full'
}

function isRecord(value: unknown): value is LocalDataExportState {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isExportPayload(value: unknown): value is LocalDataExportPayload {
  const candidate = value as Partial<LocalDataExportPayload>

  return (
    isRecord(value) &&
    Array.isArray(candidate.assets) &&
    Array.isArray(candidate.stores) &&
    isRecord(candidate.totals) &&
    typeof candidate.exportedAt === 'string' &&
    typeof candidate.exportId === 'string'
  )
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

async function toExportState<T extends object>(statePromise: Promise<T>): Promise<LocalDataExportState> {
  return { ...(await statePromise) } as LocalDataExportState
}

function sortForChecksum(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortForChecksum(item))
  }

  if (!isRecord(value)) return value

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, sortForChecksum(entryValue)]),
  )
}

function createIntegrityInput(payload: LocalDataExportPayload) {
  const { integrity: _integrity, ...rest } = payload

  return sortForChecksum(rest)
}

function createLocalDataPayloadChecksum(payload: LocalDataExportPayload) {
  return createHash('sha256')
    .update(JSON.stringify(createIntegrityInput(payload)))
    .digest('hex')
}

function attachLocalDataPayloadIntegrity(payload: LocalDataExportPayload): LocalDataExportPayload {
  return {
    ...payload,
    integrity: {
      algorithm: 'sha256',
      checksum: createLocalDataPayloadChecksum(payload),
      generatedAt: payload.exportedAt,
      scope: 'payload-v1',
    },
  }
}

function getUpdatedAt(state: LocalDataExportState) {
  return typeof state.updatedAt === 'string' ? state.updatedAt : undefined
}

function createStoreCounts(
  state: LocalDataExportState,
  labels: Record<string, string> = {},
): LocalDataExportCount[] {
  const counts: LocalDataExportCount[] = []

  for (const [key, value] of Object.entries(state)) {
    if (!Array.isArray(value)) continue

    counts.push({
      key,
      label: labels[key] ?? defaultCountLabels[key] ?? key,
      value: value.length,
    })
  }

  return counts.sort((a, b) => a.label.localeCompare(b.label, 'sk'))
}

function getStoreRecordCount(counts: LocalDataExportCount[]) {
  return counts.reduce((sum, count) => sum + count.value, 0)
}

function getMimeType(fileName: string) {
  const normalized = fileName.toLowerCase()
  if (normalized.endsWith('.png')) return 'image/png'
  if (normalized.endsWith('.webp')) return 'image/webp'
  if (normalized.endsWith('.gif')) return 'image/gif'
  if (normalized.endsWith('.svg')) return 'image/svg+xml'
  if (normalized.endsWith('.json')) return 'application/json'

  return 'image/jpeg'
}

async function collectAssetDirectory(
  definition: LocalDataAssetDefinition,
  assetPolicy: LocalDataExportAssetPolicy,
): Promise<LocalDataExportAssetSummary> {
  if (assetPolicy === 'none') {
    return {
      directory: definition.directory,
      fileCount: 0,
      files: [],
      id: definition.id,
      label: definition.label,
      totalSizeBytes: 0,
    }
  }

  const files: LocalDataExportAssetFile[] = []

  try {
    const fileNames = await readdir(definition.directory)

    for (const fileName of fileNames.sort((a, b) => a.localeCompare(b, 'sk'))) {
      const filePath = join(definition.directory, fileName)
      const fileStat = await stat(filePath)
      if (!fileStat.isFile()) continue

      const file: LocalDataExportAssetFile = {
        mimeType: getMimeType(fileName),
        name: fileName,
        path: filePath,
        sizeBytes: fileStat.size,
      }

      if (assetPolicy === 'inline') {
        file.dataBase64 = (await readFile(filePath)).toString('base64')
      }

      files.push(file)
    }
  }
  catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException
    if (maybeNodeError.code !== 'ENOENT') {
      console.warn(`Nepodarilo sa načítať asset adresár ${definition.directory}: ${maybeNodeError.message}`)
    }
  }

  return {
    directory: definition.directory,
    fileCount: files.length,
    files,
    id: definition.id,
    label: definition.label,
    totalSizeBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0),
  }
}

export async function createLocalDataExportPayload(options: LocalDataExportOptions = {}): Promise<LocalDataExportPayload> {
  const assetPolicy = options.assetPolicy ?? 'manifest'
  const exportedAt = options.exportedAt ?? new Date().toISOString()
  const mode = options.mode ?? (options.includeData === false ? 'summary' : 'full')
  const includeData = options.includeData ?? mode === 'full'
  const storeDefinitions = options.storeDefinitions ?? getDefaultLocalDataStoreDefinitions()
  const assetDefinitions = options.assetDefinitions ?? getDefaultLocalDataAssetDefinitions()
  const data: Record<string, unknown> = {}
  const stores: LocalDataExportStoreSummary[] = []

  for (const definition of storeDefinitions) {
    const state = await definition.read()
    if (!isRecord(state)) continue

    const counts = createStoreCounts(state, definition.countLabels)
    const summary: LocalDataExportStoreSummary = {
      counts,
      id: definition.id,
      label: definition.label,
      path: definition.path,
      recordCount: getStoreRecordCount(counts),
      updatedAt: getUpdatedAt(state),
    }

    stores.push(summary)

    if (includeData) {
      data[definition.id] = state
    }
  }

  const assets = await Promise.all(
    assetDefinitions.map((definition) => collectAssetDirectory(definition, assetPolicy)),
  )

  return attachLocalDataPayloadIntegrity({
    assetPolicy,
    assets,
    data: includeData ? data : undefined,
    exportedAt,
    exportId: `rybolov-cetin-${exportedAt.replaceAll(':', '-').replaceAll('.', '-')}`,
    mode,
    service: 'Rybolov Cetín',
    stores,
    totals: {
      assetFiles: assets.reduce((sum, asset) => sum + asset.fileCount, 0),
      assetSizeBytes: assets.reduce((sum, asset) => sum + asset.totalSizeBytes, 0),
      records: stores.reduce((sum, store) => sum + store.recordCount, 0),
      stores: stores.length,
    },
    version: 1,
  })
}

export function createLocalDataExportFileName(payload: Pick<LocalDataExportPayload, 'assetPolicy' | 'exportedAt'>) {
  const exportedAt = payload.exportedAt.slice(0, 19).replaceAll(':', '-')
  const suffix = payload.assetPolicy === 'inline' ? 'full' : payload.assetPolicy

  return `rybolov-cetin-backup-${exportedAt}-${suffix}.json`
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

function normalizeTotals(value: unknown): LocalDataExportTotals {
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

function getExportDataSection(payload: LocalDataExportPayload, id: string) {
  if (!isRecord(payload.data)) return undefined

  const section = payload.data[id]

  return isRecord(section) ? section : undefined
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

function hasRequiredFullData(payload: LocalDataExportPayload) {
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

async function writeJsonFile(filePath: string, value: unknown) {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
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
    options.safetyBackupDirectory ?? resolveLocalDataBackupDirectory(),
    `restore-safety-${restoredAt.slice(0, 19).replaceAll(':', '-')}.json`,
  )

  await writeJsonFile(filePath, payload)

  return filePath
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

      await mkdir(definition.directory, { recursive: true })
      await writeFile(filePath, fileBuffer)
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
