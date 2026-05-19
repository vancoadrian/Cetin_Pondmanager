import { describe, expect, it } from 'vitest'
import {
  submitReservationDecision,
  submitReservationRequest,
} from '~/app/services/reservationApiService'

const validPayload = {
  cabinProductId: 'client-value-is-derived-again-on-server',
  contactName: '  Ján API  ',
  contactPhone: '+421 900 123 999',
  dateFrom: '2026-06-10',
  dateTo: '2026-06-12',
  extraIds: ['wood-crate'],
  lake: 'velky-cetin',
  pegId: 'vc-03',
  permitId: 'permit-48h',
  rentalIds: ['landing-net-rental', 'fish-cradle-rental'],
}

describe('submitReservationRequest', () => {
  it('creates a pending mock reservation and requested rental bookings from a valid payload', () => {
    const result = submitReservationRequest(validPayload)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Reservation request should be valid.')

    expect(result.statusCode).toBe(201)
    expect(result.reservation.status).toBe('pending')
    expect(result.reservation.source).toBe('web')
    expect(result.reservation.guest).toBe('Ján API')
    expect(result.reservation.cabinProductId).toBe('large-cabin')
    expect(result.reservation.type).toBe('weekend')
    expect(result.rentalBookings).toHaveLength(2)
    expect(result.rentalBookings.every((booking) => booking.status === 'requested')).toBe(true)
  })

  it('rechecks availability on the server instead of trusting client state', () => {
    const result = submitReservationRequest({
      ...validPayload,
      dateFrom: '2026-05-16',
      dateTo: '2026-05-18',
      pegId: 'vc-01',
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Reservation request should be invalid.')

    expect(result.statusCode).toBe(422)
    expect(result.messages).toContain('Vybrané miesto nie je v zvolenom termíne rezervovateľné.')
  })

  it('rejects unknown rental and extra references before creating a mock reservation', () => {
    const result = submitReservationRequest({
      ...validPayload,
      extraIds: ['not-existing-extra'],
      rentalIds: ['not-existing-rental'],
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Reservation request should be invalid.')

    expect(result.messages).toContain('Vybraná výbava neexistuje v požičovni: not-existing-rental.')
    expect(result.messages).toContain('Vybraný doplnok nie je dostupný pre túto rezerváciu: not-existing-extra.')
  })
})

describe('submitReservationDecision', () => {
  it('approves a pending seed reservation through the API service', () => {
    const result = submitReservationDecision({
      decisionMode: 'approve',
      note: 'Potvrdené cez API.',
      reservationId: 'r-1003',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Reservation decision should be valid.')

    expect(result.statusCode).toBe(200)
    expect(result.reservation.status).toBe('confirmed')
    expect(result.reservation.internalNote).toBe('Potvrdené cez API.')
    expect(
      result.rentalBookings.find((booking) => booking.reservationId === 'r-1003')?.status,
    ).toBe('reserved')
  })

  it('returns a 404-style result for unknown reservation ids', () => {
    const result = submitReservationDecision({
      decisionMode: 'approve',
      note: 'Test.',
      reservationId: 'missing',
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Reservation decision should be invalid.')

    expect(result.statusCode).toBe(404)
    expect(result.messages).toContain('Rezervácia sa nenašla v lokálnom mock stave.')
  })
})
