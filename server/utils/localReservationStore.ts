import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { RentalBooking, Reservation } from '~/data/pond'
import { rentalBookings, reservations } from '~/data/pond'
import {
  cloneReservationWorkflowState,
  type ReservationWorkflowState,
} from '~/services/reservationWorkflowService'

export interface LocalReservationState extends ReservationWorkflowState {
  updatedAt: string
  version: 1
}

export interface StoredReservationAppend {
  rentalBookings: RentalBooking[]
  reservation: Reservation
  state: LocalReservationState
}

export function resolveLocalReservationStorePath() {
  return process.env.RYBOLOV_LOCAL_RESERVATION_STORE
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'reservation-state.json')
}

export function createSeedReservationState(updatedAt = new Date(0).toISOString()): LocalReservationState {
  return {
    ...cloneReservationWorkflowState(reservations, rentalBookings),
    updatedAt,
    version: 1,
  }
}

const seedReservationById = new Map(reservations.map((reservation) => [reservation.id, reservation]))

function normalizeLocalReservationState(state: LocalReservationState): LocalReservationState {
  return {
    ...state,
    reservations: state.reservations.map((reservation) => {
      const seedReservation = seedReservationById.get(reservation.id)
      if (reservation.contactEmail || !seedReservation?.contactEmail) return reservation

      return {
        ...reservation,
        contactEmail: seedReservation.contactEmail,
      }
    }),
  }
}

function isReservationState(value: unknown): value is LocalReservationState {
  const candidate = value as Partial<LocalReservationState>

  return (
    candidate.version === 1 &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.reservations) &&
    Array.isArray(candidate.rentalBookings)
  )
}

export async function readLocalReservationState(
  filePath = resolveLocalReservationStorePath(),
): Promise<LocalReservationState> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)

    if (isReservationState(parsed)) {
      const normalized = normalizeLocalReservationState(parsed)
      if (JSON.stringify(normalized.reservations) !== JSON.stringify(parsed.reservations)) {
        await writeLocalReservationState(normalized, filePath)
      }

      return normalized
    }
  }
  catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException
    if (maybeNodeError.code !== 'ENOENT') {
      console.warn(`Nepodarilo sa načítať lokálny stav rezervácií: ${maybeNodeError.message}`)
    }
  }

  const seedState = createSeedReservationState()
  await writeLocalReservationState(seedState, filePath)

  return seedState
}

export async function writeLocalReservationState(
  state: ReservationWorkflowState,
  filePath = resolveLocalReservationStorePath(),
): Promise<LocalReservationState> {
  const nextState: LocalReservationState = {
    rentalBookings: state.rentalBookings,
    reservations: normalizeLocalReservationState({
      rentalBookings: state.rentalBookings,
      reservations: state.reservations,
      updatedAt: new Date(0).toISOString(),
      version: 1,
    }).reservations,
    updatedAt: new Date().toISOString(),
    version: 1,
  }

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8')

  return nextState
}

export async function appendLocalReservation(
  reservation: Reservation,
  requestedRentalBookings: RentalBooking[],
  filePath = resolveLocalReservationStorePath(),
): Promise<StoredReservationAppend> {
  const currentState = await readLocalReservationState(filePath)
  const nextState = await writeLocalReservationState(
    {
      rentalBookings: [...currentState.rentalBookings, ...requestedRentalBookings],
      reservations: [...currentState.reservations, reservation],
    },
    filePath,
  )

  return {
    rentalBookings: requestedRentalBookings,
    reservation,
    state: nextState,
  }
}
