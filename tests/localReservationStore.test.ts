import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { RentalBooking, Reservation } from '~/app/data/pond'
import {
  appendLocalReservation,
  readLocalReservationState,
  writeLocalReservationState,
} from '~/server/utils/localReservationStore'

const tempDirs: string[] = []

async function createStorePath() {
  const dir = await mkdtemp(join(tmpdir(), 'rybolov-store-'))
  tempDirs.push(dir)

  return join(dir, 'reservation-state.json')
}

const reservation = (overrides: Partial<Reservation> = {}): Reservation => ({
  id: 'req-test-1',
  lake: 'velky-cetin',
  pegId: 'vc-03',
  guest: 'Lokálny test',
  contactPhone: '+421 900 111 222',
  from: '2026-06-10',
  to: '2026-06-12',
  type: 'weekend',
  status: 'pending',
  permitId: 'permit-48h',
  cabinProductId: 'large-cabin',
  rentalIds: ['landing-net-rental'],
  extraIds: ['wood-crate'],
  internalNote: 'Test lokálneho uloženia.',
  source: 'web',
  ...overrides,
})

const rentalBooking = (overrides: Partial<RentalBooking> = {}): RentalBooking => ({
  id: 'req-test-1-rental-1',
  reservationId: 'req-test-1',
  rentalItemId: 'landing-net-rental',
  lake: 'velky-cetin',
  from: '2026-06-10',
  to: '2026-06-12',
  quantity: 1,
  status: 'requested',
  note: 'Test lokálneho uloženia.',
  ...overrides,
})

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('localReservationStore', () => {
  it('creates a seed state when the local JSON file does not exist yet', async () => {
    const filePath = await createStorePath()
    const state = await readLocalReservationState(filePath)
    const raw = await readFile(filePath, 'utf8')

    expect(state.version).toBe(1)
    expect(state.reservations.length).toBeGreaterThan(0)
    expect(state.rentalBookings.length).toBeGreaterThan(0)
    expect(JSON.parse(raw)).toMatchObject({
      version: 1,
    })
  })

  it('appends a public reservation and requested rental bookings to the same state', async () => {
    const filePath = await createStorePath()
    const appended = await appendLocalReservation(reservation(), [rentalBooking()], filePath)
    const state = await readLocalReservationState(filePath)

    expect(appended.reservation.id).toBe('req-test-1')
    expect(state.reservations.some((item) => item.id === 'req-test-1')).toBe(true)
    expect(state.rentalBookings.some((item) => item.id === 'req-test-1-rental-1')).toBe(true)
  })

  it('persists reservation decision state updates', async () => {
    const filePath = await createStorePath()
    const seed = await readLocalReservationState(filePath)
    const updated = await writeLocalReservationState(
      {
        rentalBookings: seed.rentalBookings.map((booking) =>
          booking.reservationId === 'r-1003'
            ? { ...booking, status: 'reserved' }
            : booking,
        ),
        reservations: seed.reservations.map((item) =>
          item.id === 'r-1003'
            ? { ...item, internalNote: 'Potvrdené lokálne.', status: 'confirmed' }
            : item,
        ),
      },
      filePath,
    )
    const reread = await readLocalReservationState(filePath)

    expect(updated.reservations.find((item) => item.id === 'r-1003')?.status).toBe('confirmed')
    expect(reread.reservations.find((item) => item.id === 'r-1003')?.internalNote).toBe('Potvrdené lokálne.')
    expect(reread.rentalBookings.find((item) => item.reservationId === 'r-1003')?.status).toBe('reserved')
  })
})
