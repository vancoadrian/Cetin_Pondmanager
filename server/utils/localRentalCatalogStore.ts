import { join } from 'node:path'
import type { RentalItem, ReservationExtra } from '~/data/pond'
import { rentalItems, reservationExtras } from '~/data/pond'
import type { RentalCatalogWorkflowState } from '~/services/rentalCatalogService'
import { sortRentalItems, sortReservationExtras } from '~/services/rentalCatalogService'
import {
  guardCorruptRuntimeState,
  readRuntimeDocument,
  writeRuntimeDocument,
} from './runtimeStateStore'

export interface LocalRentalCatalogState extends RentalCatalogWorkflowState {
  updatedAt: string
  version: 1
}

const STORE_KEY = 'rental-catalog-state'

export function resolveLocalRentalCatalogStorePath() {
  return process.env.RYBOLOV_LOCAL_RENTAL_CATALOG_STORE
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'rental-catalog-state.json')
}

export function createSeedRentalCatalogState(updatedAt = new Date(0).toISOString()): LocalRentalCatalogState {
  return {
    rentalItems: sortRentalItems(rentalItems).map((item) => ({ ...item })),
    reservationExtras: sortReservationExtras(reservationExtras).map((extra) => ({ ...extra })),
    updatedAt,
    version: 1,
  }
}

function isRentalItem(value: unknown): value is RentalItem {
  const candidate = value as Partial<RentalItem>

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.label === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.stock === 'number' &&
    typeof candidate.priceLabel === 'string' &&
    typeof candidate.recommended === 'boolean' &&
    typeof candidate.active === 'boolean'
  )
}

function isReservationExtra(value: unknown): value is ReservationExtra {
  const candidate = value as Partial<ReservationExtra>

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.label === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.priceLabel === 'string' &&
    typeof candidate.source === 'string' &&
    typeof candidate.active === 'boolean'
  )
}

function isRentalCatalogState(value: unknown): value is LocalRentalCatalogState {
  const candidate = value as Partial<LocalRentalCatalogState>

  return (
    candidate.version === 1 &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.rentalItems) &&
    candidate.rentalItems.every(isRentalItem) &&
    Array.isArray(candidate.reservationExtras) &&
    candidate.reservationExtras.every(isReservationExtra)
  )
}

const legacyReservationExtraDescriptions: Record<string, string[]> = {
  'gazebo-kocka': [
    'Web uvádza možnosť prenajatia altánku na firemné akcie, oslavy a večierky.',
  ],
  'third-rod': [
    'Web uvádza možnosť dokúpenia po dohode so správcom.',
  ],
}

const seedReservationExtraById = new Map(reservationExtras.map((extra) => [extra.id, extra]))

function normalizeReservationExtraCopy(extra: ReservationExtra) {
  const seedExtra = seedReservationExtraById.get(extra.id)
  const legacyDescriptions = legacyReservationExtraDescriptions[extra.id] ?? []

  if (seedExtra && legacyDescriptions.includes(extra.description)) {
    return {
      changed: true,
      extra: {
        ...extra,
        description: seedExtra.description,
      },
    }
  }

  return {
    changed: false,
    extra,
  }
}

function normalizeRentalCatalogStateCopy(state: LocalRentalCatalogState) {
  let changed = false
  const reservationExtras = state.reservationExtras.map((extra) => {
    const normalized = normalizeReservationExtraCopy(extra)
    changed ||= normalized.changed
    return normalized.extra
  })

  return {
    changed,
    state: {
      ...state,
      reservationExtras,
    },
  }
}

function parseLocalRentalCatalogState(payload: unknown): LocalRentalCatalogState | undefined {
  if (!isRentalCatalogState(payload)) return undefined

  return {
    ...payload,
    rentalItems: sortRentalItems(payload.rentalItems),
    reservationExtras: sortReservationExtras(payload.reservationExtras),
  }
}

export async function readLocalRentalCatalogState(
  filePath = resolveLocalRentalCatalogStorePath(),
): Promise<LocalRentalCatalogState> {
  const document = await readRuntimeDocument(STORE_KEY, filePath)

  if (document.found) {
    const parsed = parseLocalRentalCatalogState(document.payload)
    if (parsed) {
      const normalized = normalizeRentalCatalogStateCopy(parsed)

      if (normalized.changed) {
        return writeLocalRentalCatalogState(normalized.state, filePath)
      }

      return normalized.state
    }
    guardCorruptRuntimeState(STORE_KEY)
  }

  const seedState = createSeedRentalCatalogState()
  await writeLocalRentalCatalogState(seedState, filePath)

  return seedState
}

export async function writeLocalRentalCatalogState(
  state: RentalCatalogWorkflowState,
  filePath = resolveLocalRentalCatalogStorePath(),
): Promise<LocalRentalCatalogState> {
  const nextState: LocalRentalCatalogState = {
    rentalItems: sortRentalItems(state.rentalItems),
    reservationExtras: sortReservationExtras(state.reservationExtras),
    updatedAt: new Date().toISOString(),
    version: 1,
  }

  await writeRuntimeDocument(STORE_KEY, filePath, nextState)

  return nextState
}
