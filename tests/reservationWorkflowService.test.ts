import { describe, expect, it } from 'vitest'
import type { RentalBooking, Reservation } from '~/app/data/pond'
import {
  applyReservationDecision,
  cloneReservationWorkflowState,
  getDefaultDecisionMode,
} from '~/app/services/reservationWorkflowService'

const reservation = (overrides: Partial<Reservation> = {}): Reservation => ({
  id: 'reservation-1',
  lake: 'velky-cetin',
  pegId: 'peg-1',
  guest: 'Testovací hosť',
  contactPhone: '+421 900 000 000',
  from: '2026-06-10',
  to: '2026-06-12',
  type: 'weekend',
  status: 'pending',
  permitId: 'permit-48h',
  rentalIds: ['landing-net'],
  extraIds: ['wood-crate'],
  internalNote: 'Pôvodná poznámka.',
  source: 'web',
  ...overrides,
})

const rentalBooking = (overrides: Partial<RentalBooking> = {}): RentalBooking => ({
  id: 'rental-booking-1',
  reservationId: 'reservation-1',
  rentalItemId: 'landing-net',
  lake: 'velky-cetin',
  from: '2026-06-10',
  to: '2026-06-12',
  quantity: 1,
  status: 'requested',
  note: 'Pôvodná poznámka.',
  ...overrides,
})

describe('reservationWorkflowService', () => {
  it('uses approve as the default only for pending reservations', () => {
    expect(getDefaultDecisionMode(reservation({ status: 'pending' }))).toBe('approve')
    expect(getDefaultDecisionMode(reservation({ status: 'confirmed' }))).toBe('call')
    expect(getDefaultDecisionMode()).toBe('call')
  })

  it('clones mutable reservation arrays before admin workflow edits', () => {
    const sourceReservation = reservation()
    const state = cloneReservationWorkflowState([sourceReservation], [rentalBooking()])

    state.reservations[0]!.rentalIds.push('fish-cradle')
    state.reservations[0]!.extraIds.push('grill')

    expect(sourceReservation.rentalIds).toEqual(['landing-net'])
    expect(sourceReservation.extraIds).toEqual(['wood-crate'])
  })

  it('approves reservations and reserves requested rental equipment', () => {
    const result = applyReservationDecision(
      {
        reservations: [reservation()],
        rentalBookings: [rentalBooking()],
      },
      {
        reservationId: 'reservation-1',
        decisionMode: 'approve',
        note: '  Potvrdené telefonicky.  ',
      },
    )

    expect(result.reservationStatus).toBe('confirmed')
    expect(result.rentalStatus).toBe('reserved')
    expect(result.reservations[0]?.status).toBe('confirmed')
    expect(result.reservations[0]?.internalNote).toBe('Potvrdené telefonicky.')
    expect(result.rentalBookings[0]?.status).toBe('reserved')
    expect(result.rentalBookings[0]?.note).toBe('Potvrdené telefonicky.')
  })

  it('rejects reservations and releases rental equipment', () => {
    const result = applyReservationDecision(
      {
        reservations: [reservation()],
        rentalBookings: [rentalBooking()],
      },
      {
        reservationId: 'reservation-1',
        decisionMode: 'reject',
        note: 'Kapacita je blokovaná pre servis.',
      },
    )

    expect(result.reservations[0]?.status).toBe('blocked')
    expect(result.rentalBookings[0]?.status).toBe('cancelled')
    expect(result.message).toContain('blokovaná')
  })

  it('keeps call decisions pending and preserves old notes when the input note is empty', () => {
    const result = applyReservationDecision(
      {
        reservations: [reservation()],
        rentalBookings: [rentalBooking()],
      },
      {
        reservationId: 'reservation-1',
        decisionMode: 'call',
        note: '   ',
      },
    )

    expect(result.reservations[0]?.status).toBe('pending')
    expect(result.reservations[0]?.internalNote).toBe('Pôvodná poznámka.')
    expect(result.rentalBookings[0]?.status).toBe('requested')
    expect(result.rentalBookings[0]?.note).toBe('Pôvodná poznámka.')
  })

  it('returns a friendly message when the reservation does not exist', () => {
    const state = {
      reservations: [reservation()],
      rentalBookings: [rentalBooking()],
    }
    const result = applyReservationDecision(state, {
      reservationId: 'missing-reservation',
      decisionMode: 'approve',
      note: 'Test.',
    })

    expect(result.message).toContain('nenašla')
    expect(result.reservations).toBe(state.reservations)
    expect(result.rentalBookings).toBe(state.rentalBookings)
  })
})
