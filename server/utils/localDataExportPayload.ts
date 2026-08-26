import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type {
  LocalDataExportAssetFile,
  LocalDataExportAssetPolicy,
  LocalDataExportAssetSummary,
  LocalDataExportCount,
  LocalDataExportMode,
  LocalDataExportPayload,
  LocalDataExportStoreSummary,
} from '~/services/localDataExportService'
import { listAssetObjects, readAssetObject, type AssetBucket } from './assetObjectStore'
import { readLocalAccountState, resolveLocalAccountStorePath } from './localAccountStore'
import { readLocalAuditLogState, resolveLocalAuditLogStorePath } from './localAuditLogStore'
import { readLocalCabinCatalogState, resolveLocalCabinCatalogStorePath } from './localCabinCatalogStore'
import { resolveLocalCatchPhotoDir } from './localCatchPhotoStore'
import { readLocalCatchReportState, resolveLocalCatchReportStorePath } from './localCatchReportStore'
import { readLocalCatchState, resolveLocalCatchStorePath } from './localCatchStore'
import { readLocalClosureState, resolveLocalClosureStorePath } from './localClosureStore'
import { readLocalErrorLogState, resolveLocalErrorLogStorePath } from './localErrorLogStore'
import { readLocalFishRegistryState, resolveLocalFishRegistryStorePath } from './localFishRegistryStore'
import {
  readLocalLargeFishAssistanceState,
  resolveLocalLargeFishAssistanceStorePath,
} from './localLargeFishAssistanceStore'
import { resolveLocalMapAssetDir } from './localMapAssetStore'
import {
  readLocalMapDraftState,
  readLocalMapState,
  resolveLocalMapDraftStorePath,
  resolveLocalMapStorePath,
} from './localMapStore'
import { readLocalNotificationState, resolveLocalNotificationStorePath } from './localNotificationStore'
import { readLocalPaymentMethodState, resolveLocalPaymentMethodStorePath } from './localPaymentMethodStore'
import { readLocalPlaceIssueState, resolveLocalPlaceIssueStorePath } from './localPlaceIssueStore'
import { readLocalRentalCatalogState, resolveLocalRentalCatalogStorePath } from './localRentalCatalogStore'
import { readLocalReservationState, resolveLocalReservationStorePath } from './localReservationStore'
import { resolveLocalSponsorAssetDir } from './localSponsorAssetStore'
import { readLocalSponsorState, resolveLocalSponsorStorePath } from './localSponsorStore'
import { readLocalTournamentState, resolveLocalTournamentStorePath } from './localTournamentStore'

// This module owns the "create a backup" path: building the export payload
// (store + asset collection), attaching the integrity checksum, and the low
// level payload helpers (isRecord/isExportPayload/checksum/counts) that are
// shared with the import-preview, restore and safety-backup modules.

export type LocalDataExportState = Record<string, unknown>

export interface LocalDataStoreDefinition {
  countLabels?: Record<string, string>
  id: string
  label: string
  path: string
  read: () => Promise<LocalDataExportState>
  /** runtime_store_states document name (file name without .json). */
  storeKey: string
}

export interface LocalDataAssetDefinition {
  /** Supabase Storage bucket backing this asset group. */
  bucket: AssetBucket
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

const defaultCountLabels: Record<string, string> = {
  alerts: 'Oznamy',
  broadcasts: 'Broadcasty',
  cabinProducts: 'Chaty',
  catchPhotos: 'Fotky v databáze',
  catches: 'Úlovky',
  credentialOverrides: 'Lokálne zmenené heslá',
  deliveryLogs: 'Doručenia',
  deletions: 'Zmazané účty',
  errors: 'Chyby',
  events: 'Audit udalosti',
  fish: 'Čipované ryby',
  requests: 'Privolania správcu',
  observations: 'Merania rýb',
  lakeClosures: 'Uzávierky',
  mapFacilities: 'Servisné body',
  mapLayers: 'Vrstvy mapy',
  mapShapes: 'Polygony mapy',
  paymentMethods: 'Platobné metódy',
  passwordResets: 'Aktívne obnovy hesla',
  pegs: 'Lovné miesta',
  placeIssues: 'Hlásenia nedostatkov',
  profileOverrides: 'Upravené profily účtov',
  rentalBookings: 'Rezervácie výbavy',
  rentalItems: 'Požičovňa',
  registeredAccounts: 'Rybárske účty',
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
      id: 'accounts',
      label: 'Stav používateľských účtov',
      path: resolveLocalAccountStorePath(),
      read: () => toExportState(readLocalAccountState()),
      storeKey: 'account-state',
    },
    {
      id: 'reservations',
      label: 'Rezervácie a obsadenosť',
      path: resolveLocalReservationStorePath(),
      read: () => toExportState(readLocalReservationState()),
      storeKey: 'reservation-state',
    },
    {
      id: 'paymentMethods',
      label: 'Platobné metódy',
      path: resolveLocalPaymentMethodStorePath(),
      read: () => toExportState(readLocalPaymentMethodState()),
      storeKey: 'payment-method-state',
    },
    {
      id: 'rentalCatalog',
      label: 'Požičovňa a doplnky',
      path: resolveLocalRentalCatalogStorePath(),
      read: () => toExportState(readLocalRentalCatalogState()),
      storeKey: 'rental-catalog-state',
    },
    {
      id: 'cabinCatalog',
      label: 'Cenník chát',
      path: resolveLocalCabinCatalogStorePath(),
      read: () => toExportState(readLocalCabinCatalogState()),
      storeKey: 'cabin-catalog-state',
    },
    {
      id: 'sponsors',
      label: 'Sponzori',
      path: resolveLocalSponsorStorePath(),
      read: () => toExportState(readLocalSponsorState()),
      storeKey: 'sponsor-state',
    },
    {
      id: 'map',
      label: 'Mapa revíru',
      path: resolveLocalMapStorePath(),
      read: () => toExportState(readLocalMapState()),
      storeKey: 'map-state',
    },
    {
      id: 'mapDraft',
      label: 'Rozpracovaná mapa revíru',
      path: resolveLocalMapDraftStorePath(),
      read: async () => toExportState(readLocalMapDraftState(undefined, await readLocalMapState())),
      storeKey: 'map-draft-state',
    },
    {
      id: 'closures',
      label: 'Uzávierky a sezóny',
      path: resolveLocalClosureStorePath(),
      read: () => toExportState(readLocalClosureState()),
      storeKey: 'closure-state',
    },
    {
      id: 'placeIssues',
      label: 'Hlásenia nedostatkov',
      path: resolveLocalPlaceIssueStorePath(),
      read: () => toExportState(readLocalPlaceIssueState()),
      storeKey: 'place-issue-state',
    },
    {
      id: 'catches',
      label: 'Úlovky a zápisníky',
      path: resolveLocalCatchStorePath(),
      read: () => toExportState(readLocalCatchState()),
      storeKey: 'catch-state',
    },
    {
      id: 'fishRegistry',
      label: 'Register čipovaných rýb',
      path: resolveLocalFishRegistryStorePath(),
      read: () => toExportState(readLocalFishRegistryState()),
      storeKey: 'fish-registry-state',
    },
    {
      id: 'largeFishAssistance',
      label: 'Privolania správcu k veľkým rybám',
      path: resolveLocalLargeFishAssistanceStorePath(),
      read: () => toExportState(readLocalLargeFishAssistanceState()),
      storeKey: 'large-fish-assistance-state',
    },
    {
      id: 'catchReports',
      label: 'Uložené reporty úlovkov',
      path: resolveLocalCatchReportStorePath(),
      read: () => toExportState(readLocalCatchReportState()),
      storeKey: 'catch-reports',
    },
    {
      id: 'tournaments',
      label: 'Súťažný dispečing',
      path: resolveLocalTournamentStorePath(),
      read: () => toExportState(readLocalTournamentState()),
      storeKey: 'tournament-state',
    },
    {
      id: 'notifications',
      label: 'Notifikácie a odbery',
      path: resolveLocalNotificationStorePath(),
      read: () => toExportState(readLocalNotificationState()),
      storeKey: 'notification-state',
    },
    {
      id: 'auditLog',
      label: 'Audit log',
      path: resolveLocalAuditLogStorePath(),
      read: () => toExportState(readLocalAuditLogState()),
      storeKey: 'audit-log',
    },
    {
      id: 'errorLog',
      label: 'Error log',
      path: resolveLocalErrorLogStorePath(),
      read: () => toExportState(readLocalErrorLogState()),
      storeKey: 'error-log',
    },
  ]
}

export function getDefaultLocalDataAssetDefinitions(): LocalDataAssetDefinition[] {
  return [
    {
      bucket: 'catch-photos',
      directory: resolveLocalCatchPhotoDir(),
      id: 'catchPhotos',
      label: 'Fotky úlovkov',
    },
    {
      bucket: 'map-assets',
      directory: resolveLocalMapAssetDir(),
      id: 'mapAssets',
      label: 'Podklady máp',
    },
    {
      bucket: 'sponsor-assets',
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

export function isRecord(value: unknown): value is LocalDataExportState {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isExportPayload(value: unknown): value is LocalDataExportPayload {
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

export function createLocalDataPayloadChecksum(payload: LocalDataExportPayload) {
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

export function createStoreCounts(
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

export function getStoreRecordCount(counts: LocalDataExportCount[]) {
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

async function collectAssetBucket(
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
  const objects = await listAssetObjects(definition.bucket, { fileDirectory: definition.directory })

  for (const object of [...objects].sort((a, b) => a.name.localeCompare(b.name, 'sk'))) {
    const file: LocalDataExportAssetFile = {
      mimeType: getMimeType(object.name),
      name: object.name,
      path: join(definition.directory, object.name),
      sizeBytes: object.sizeBytes ?? 0,
    }

    if (assetPolicy === 'inline') {
      const { data } = await readAssetObject(definition.bucket, object.name, { fileDirectory: definition.directory })
      file.dataBase64 = data.toString('base64')
      file.sizeBytes = data.byteLength
    }

    files.push(file)
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
    assetDefinitions.map((definition) => collectAssetBucket(definition, assetPolicy)),
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

export function getExportDataSection(payload: LocalDataExportPayload, id: string) {
  if (!isRecord(payload.data)) return undefined

  const section = payload.data[id]

  return isRecord(section) ? section : undefined
}
