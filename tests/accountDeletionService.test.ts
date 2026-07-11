import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ANONYMIZED_ANGLER_LABEL,
  anonymizeAccountData,
} from '~/app/services/accountDeletionService'
import { findMockAnglerAccountById } from '~/app/services/anglerAccountService'
import { createSeedCatchState, readLocalCatchState, writeLocalCatchState } from '~/server/utils/localCatchStore'
import {
  createSeedReservationState,
  readLocalReservationState,
  writeLocalReservationState,
} from '~/server/utils/localReservationStore'

let tempDir: string | undefined

afterEach(async () => {
  if (tempDir) await rm(tempDir, { force: true, recursive: true })
  tempDir = undefined
})

describe('accountDeletionService', () => {
  it('anonymizes personal links while keeping operational records', async () => {
    const account = findMockAnglerAccountById('angler-marek')!
    const result = anonymizeAccountData(
      account,
      createSeedReservationState(),
      createSeedCatchState(),
    )

    expect(result.summary).toEqual({
      catches: 1,
      logbookEntries: 1,
      logbooks: 1,
      reservations: 1,
    })
    expect(result.reservationState.reservations.find((item) => item.id === 'r-1001')).toMatchObject({
      contactPhone: '',
      guest: ANONYMIZED_ANGLER_LABEL,
    })
    expect(result.reservationState.reservations.find((item) => item.id === 'r-1001')?.contactEmail).toBeUndefined()
    expect(result.reservationState.reservations.find((item) => item.id === 'r-1002')?.guest).toBe('Tím Nitra Carp')
    expect(result.catchState.catches.find((item) => item.id === 'c-2401')?.angler).toBe(ANONYMIZED_ANGLER_LABEL)

    const logbook = result.catchState.tripLogbooks.find((item) => item.id === 'logbook-cabin-3-may')
    expect(logbook?.owner).toBe(ANONYMIZED_ANGLER_LABEL)
    expect(logbook?.ownerUserId).toBeUndefined()
    expect(logbook?.members.find((member) => member.id === 'member-marek')).toMatchObject({
      name: ANONYMIZED_ANGLER_LABEL,
    })
    expect(logbook?.members.find((member) => member.id === 'member-marek')?.userId).toBeUndefined()
    expect(result.catchState.tripLogbookEntries.find((item) => item.id === 'entry-3001')?.angler)
      .toBe(ANONYMIZED_ANGLER_LABEL)
  })

  it('does not restore anonymized seed account links after local persistence', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'rybolov-account-anonymization-'))
    const reservationPath = join(tempDir, 'reservation-state.json')
    const catchPath = join(tempDir, 'catch-state.json')
    const account = findMockAnglerAccountById('angler-marek')!
    const result = anonymizeAccountData(
      account,
      createSeedReservationState(),
      createSeedCatchState(),
    )

    await writeLocalReservationState(result.reservationState, reservationPath)
    await writeLocalCatchState(result.catchState, catchPath)
    const storedReservations = await readLocalReservationState(reservationPath)
    const storedCatches = await readLocalCatchState(catchPath)
    const storedReservation = storedReservations.reservations.find((item) => item.id === 'r-1001')
    const storedLogbook = storedCatches.tripLogbooks.find((item) => item.id === 'logbook-cabin-3-may')

    expect(storedReservation?.contactEmail).toBeUndefined()
    expect(storedReservation?.guest).toBe(ANONYMIZED_ANGLER_LABEL)
    expect(storedLogbook?.ownerUserId).toBeUndefined()
    expect(storedLogbook?.members.find((member) => member.id === 'member-marek')?.userId).toBeUndefined()
  })
})
