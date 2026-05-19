import { describe, expect, it } from 'vitest'
import type { RentalBooking, RentalItem } from '~/app/data/pond'
import { getRentalAvailability } from '~/app/utils/rentals'

const item = (overrides: Partial<RentalItem> = {}): RentalItem => ({
  id: 'landing-net',
  label: 'Podberák',
  category: 'fish-care',
  description: 'Testovacia výbava.',
  stock: 3,
  priceLabel: 'v cene testu',
  recommended: true,
  ...overrides,
})

const booking = (overrides: Partial<RentalBooking> = {}): RentalBooking => ({
  id: 'booking-1',
  reservationId: 'reservation-1',
  rentalItemId: 'landing-net',
  lake: 'velky-cetin',
  from: '2026-06-10',
  to: '2026-06-12',
  quantity: 1,
  status: 'reserved',
  note: 'Test.',
  ...overrides,
})

describe('getRentalAvailability', () => {
  it('counts overlapping reserved and requested bookings against stock', () => {
    const result = getRentalAvailability(item(), {
      dateFrom: '2026-06-11',
      dateTo: '2026-06-11',
      bookings: [
        booking({ id: 'reserved-1', quantity: 1, status: 'reserved' }),
        booking({ id: 'requested-1', quantity: 1, status: 'requested' }),
      ],
    })

    expect(result.status).toBe('limited')
    expect(result.reservedQuantity).toBe(1)
    expect(result.requestedQuantity).toBe(1)
    expect(result.availableQuantity).toBe(1)
    expect(result.sourceIds).toEqual(['reserved-1', 'requested-1'])
  })

  it('ignores returned, unavailable, cancelled and non-overlapping bookings', () => {
    const result = getRentalAvailability(item({ stock: 2 }), {
      dateFrom: '2026-06-11',
      dateTo: '2026-06-11',
      bookings: [
        booking({ id: 'returned-1', status: 'returned', quantity: 2 }),
        booking({ id: 'unavailable-1', status: 'unavailable', quantity: 2 }),
        booking({ id: 'cancelled-1', status: 'cancelled', quantity: 2 }),
        booking({ id: 'old-1', from: '2026-06-01', to: '2026-06-02', quantity: 2 }),
      ],
    })

    expect(result.status).toBe('limited')
    expect(result.availableQuantity).toBe(2)
    expect(result.sourceIds).toEqual([])
    expect(result.reasons[0]).toBe('Sklad 2 ks bez rezervácie v termíne.')
  })

  it('marks rental item unavailable once active bookings exhaust stock', () => {
    const result = getRentalAvailability(item({ stock: 2 }), {
      dateFrom: '2026-06-11',
      dateTo: '2026-06-11',
      bookings: [booking({ quantity: 2, status: 'reserved' })],
    })

    expect(result.status).toBe('unavailable')
    expect(result.reservable).toBe(false)
    expect(result.availableQuantity).toBe(0)
  })
})
