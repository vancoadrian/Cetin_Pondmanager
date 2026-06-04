import { readdir, readFile, stat } from 'node:fs/promises'
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
import { readLocalAuditLogState, resolveLocalAuditLogStorePath } from './localAuditLogStore'
import { readLocalCabinCatalogState, resolveLocalCabinCatalogStorePath } from './localCabinCatalogStore'
import { resolveLocalCatchPhotoDir } from './localCatchPhotoStore'
import { readLocalCatchReportState, resolveLocalCatchReportStorePath } from './localCatchReportStore'
import { readLocalCatchState, resolveLocalCatchStorePath } from './localCatchStore'
import { readLocalClosureState, resolveLocalClosureStorePath } from './localClosureStore'
import { readLocalErrorLogState, resolveLocalErrorLogStorePath } from './localErrorLogStore'
import { resolveLocalMapAssetDir } from './localMapAssetStore'
import { readLocalMapState, resolveLocalMapStorePath } from './localMapStore'
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

async function toExportState<T extends object>(statePromise: Promise<T>): Promise<LocalDataExportState> {
  return { ...(await statePromise) } as LocalDataExportState
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

  return {
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
  }
}

export function createLocalDataExportFileName(payload: Pick<LocalDataExportPayload, 'assetPolicy' | 'exportedAt'>) {
  const exportedAt = payload.exportedAt.slice(0, 19).replaceAll(':', '-')
  const suffix = payload.assetPolicy === 'inline' ? 'full' : payload.assetPolicy

  return `rybolov-cetin-backup-${exportedAt}-${suffix}.json`
}
