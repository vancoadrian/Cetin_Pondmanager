import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { RentalItem, ReservationExtra } from '~/data/pond'
import { rentalItems, reservationExtras } from '~/data/pond'
import type { RentalCatalogWorkflowState } from '~/services/rentalCatalogService'
import { sortRentalItems, sortReservationExtras } from '~/services/rentalCatalogService'

export interface LocalRentalCatalogState extends RentalCatalogWorkflowState {
  updatedAt: string
  version: 1
}

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

export async function readLocalRentalCatalogState(
  filePath = resolveLocalRentalCatalogStorePath(),
): Promise<LocalRentalCatalogState> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)

    if (isRentalCatalogState(parsed)) {
      return {
        ...parsed,
        rentalItems: sortRentalItems(parsed.rentalItems),
        reservationExtras: sortReservationExtras(parsed.reservationExtras),
      }
    }
  }
  catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException
    if (maybeNodeError.code !== 'ENOENT') {
      console.warn(`Nepodarilo sa načítať lokálny stav požičovne: ${maybeNodeError.message}`)
    }
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

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8')

  return nextState
}
