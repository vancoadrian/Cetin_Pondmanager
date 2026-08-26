import { join } from 'node:path'
import type { RentalBooking, Reservation } from '~/data/pond'
import { rentalBookings, reservations } from '~/data/pond'
import {
  cloneReservationWorkflowState,
  type ReservationWorkflowState,
} from '~/services/reservationWorkflowService'
import {
  guardCorruptRuntimeState,
  mutateRuntimeDocument,
  readRuntimeDocument,
  writeRuntimeDocument,
} from './runtimeStateStore'

export interface LocalReservationState extends ReservationWorkflowState {
  updatedAt: string
  version: 1
}

export interface StoredReservationAppend {
  rentalBookings: RentalBooking[]
  reservation: Reservation
  state: LocalReservationState
}

const STORE_KEY = 'reservation-state'

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
      if (
        reservation.contactEmail !== undefined
        || !seedReservation?.contactEmail
        || reservation.guest !== seedReservation.guest
      ) return reservation

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

function parseLocalReservationState(payload: unknown): LocalReservationState | undefined {
  if (!isReservationState(payload)) return undefined

  return payload
}

function composeReservationState(state: ReservationWorkflowState): LocalReservationState {
  return {
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
}

export async function readLocalReservationState(
  filePath = resolveLocalReservationStorePath(),
): Promise<LocalReservationState> {
  const document = await readRuntimeDocument(STORE_KEY, filePath)

  if (document.found) {
    const parsed = parseLocalReservationState(document.payload)
    if (parsed) {
      const normalized = normalizeLocalReservationState(parsed)
      if (JSON.stringify(normalized.reservations) !== JSON.stringify(parsed.reservations)) {
        await writeLocalReservationState(normalized, filePath)
      }

      return normalized
    }
    guardCorruptRuntimeState(STORE_KEY)
  }

  const seedState = createSeedReservationState()
  await writeLocalReservationState(seedState, filePath)

  return seedState
}

export async function writeLocalReservationState(
  state: ReservationWorkflowState,
  filePath = resolveLocalReservationStorePath(),
): Promise<LocalReservationState> {
  const nextState = composeReservationState(state)
  await writeRuntimeDocument(STORE_KEY, filePath, nextState)

  return nextState
}

export async function appendLocalReservation(
  reservation: Reservation,
  requestedRentalBookings: RentalBooking[],
  filePath = resolveLocalReservationStorePath(),
): Promise<StoredReservationAppend> {
  return mutateRuntimeDocument(STORE_KEY, filePath, async (document) => {
    let currentState: LocalReservationState | undefined
    if (document.found) {
      const parsed = parseLocalReservationState(document.payload)
      if (parsed) currentState = normalizeLocalReservationState(parsed)
      else guardCorruptRuntimeState(STORE_KEY)
    }
    currentState ??= createSeedReservationState()

    const state = composeReservationState({
      rentalBookings: [...currentState.rentalBookings, ...requestedRentalBookings],
      reservations: [...currentState.reservations, reservation],
    })

    return {
      payload: state,
      result: {
        rentalBookings: requestedRentalBookings,
        reservation,
        state,
      },
    }
  })
}
