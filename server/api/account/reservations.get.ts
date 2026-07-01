import { defineEventHandler } from 'h3'
import { getMockAnglerAccountEmails, type MockAnglerAccount } from '~/services/anglerAccountService'
import type { AccountReservation, AnglerReservationsResponse } from '~/services/reservationApiService'
import { requireMockAnglerAccount } from '../../utils/anglerSession'
import { readLocalReservationState } from '../../utils/localReservationStore'

function normalizeIdentity(value?: string | null) {
  return value?.trim().toLocaleLowerCase('sk') ?? ''
}

function toAccountReservation(reservation: Awaited<ReturnType<typeof readLocalReservationState>>['reservations'][number]): AccountReservation {
  const { internalNote: _internalNote, ...accountReservation } = reservation

  return accountReservation
}

function toPublicAccount(account: MockAnglerAccount): AnglerReservationsResponse['account'] {
  return {
    email: account.email,
    id: account.id,
    name: account.name,
  }
}

export default defineEventHandler(async (event): Promise<AnglerReservationsResponse> => {
  const account = requireMockAnglerAccount(event)
  const state = await readLocalReservationState()
  const accountEmails = new Set(getMockAnglerAccountEmails(account))
  const accountName = normalizeIdentity(account.name)
  const reservations = state.reservations
    .filter((reservation) => {
      const reservationEmail = normalizeIdentity(reservation.contactEmail)
      if (reservationEmail) return accountEmails.has(reservationEmail)

      return normalizeIdentity(reservation.guest) === accountName
    })
    .map(toAccountReservation)
    .sort((first, second) => second.from.localeCompare(first.from))
  const reservationIds = new Set(reservations.map((reservation) => reservation.id))

  return {
    account: toPublicAccount(account),
    ok: true,
    rentalBookings: state.rentalBookings.filter((booking) => reservationIds.has(booking.reservationId)),
    reservations,
    updatedAt: state.updatedAt,
  }
})
