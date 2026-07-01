import { describe, expect, it } from 'vitest'
import {
  submitAdminReservationRequest,
  submitReservationDecision,
  submitReservationRequest,
} from '~/app/services/reservationApiService'
import { createMockPondRepository, createPondSnapshot } from '~/app/repositories/pondRepository'
import { createPondService } from '~/app/services/pondService'

const validPayload = {
  cabinProductId: 'client-value-is-derived-again-on-server',
  contactEmail: 'jan.api@example.com',
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
    expect(result.reservation.contactEmail).toBe('jan.api@example.com')
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

  it('uses injected closure state when validating a reservation request', () => {
    const service = createPondService(
      createMockPondRepository(
        createPondSnapshot({
          lakeClosures: [
            {
              affectsReservations: true,
              from: '2026-06-10',
              id: 'closure-api-test',
              lake: 'velky-cetin',
              notes: 'Dynamická lokálna uzávierka.',
              reason: 'maintenance',
              title: 'Dynamická údržba',
              to: '2026-06-12',
              visibility: 'internal',
            },
          ],
        }),
      ),
    )
    const result = submitReservationRequest(validPayload, service)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Reservation request should be blocked by injected closure.')

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

  it('rejects inactive rental catalog items and inactive extras', () => {
    const snapshot = createPondSnapshot()
    const service = createPondService(
      createMockPondRepository(
        createPondSnapshot({
          rentalItems: snapshot.rentalItems.map((item) =>
            item.id === 'landing-net-rental' ? { ...item, active: false } : item,
          ),
          reservationExtras: snapshot.reservationExtras.map((extra) =>
            extra.id === 'wood-crate' ? { ...extra, active: false } : extra,
          ),
        }),
      ),
    )
    const result = submitReservationRequest(validPayload, service)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Reservation request should be invalid.')

    expect(result.messages).toContain('Vybraná výbava nie je zapnutá v požičovni: Podberák 1 m+.')
    expect(result.messages).toContain('Vybraný doplnok nie je dostupný pre túto rezerváciu: wood-crate.')
  })
})

describe('submitAdminReservationRequest', () => {
  it('creates a confirmed phone reservation with reserved rental bookings', () => {
    const result = submitAdminReservationRequest({
      ...validPayload,
      contactName: 'Telefonická rezervácia',
      contactPhone: '+421 905 444 111',
      internalNote: 'Hosť volal správcovi a termín je potvrdený.',
      paymentMethodId: 'cash-on-site',
      source: 'phone',
      status: 'confirmed',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Admin reservation request should be valid.')

    expect(result.statusCode).toBe(201)
    expect(result.reservation.status).toBe('confirmed')
    expect(result.reservation.source).toBe('phone')
    expect(result.reservation.paymentMethodId).toBe('cash-on-site')
    expect(result.reservation.paymentStatus).toBe('pending')
    expect(result.reservation.internalNote).toBe('Hosť volal správcovi a termín je potvrdený.')
    expect(result.rentalBookings.every((booking) => booking.status === 'reserved')).toBe(true)
  })

  it('rejects a disabled payment method for admin-created reservations', () => {
    const result = submitAdminReservationRequest({
      ...validPayload,
      paymentMethodId: 'card-gateway',
      source: 'admin',
      status: 'pending',
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Disabled payment method should be invalid.')

    expect(result.messages).toContain('Vybraná platobná metóda nie je zapnutá: Platobná brána.')
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
    expect(result.communicationDraft).toMatchObject({
      channel: 'email',
      emailTo: 'peter.b@example.com',
      recipientPhone: '+421 908 444 321',
    })
    expect(result.communicationDraft?.smsBody).toContain('je potvrdená')
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
    expect(result.messages).toContain('Rezervácia sa nenašla.')
  })
})
