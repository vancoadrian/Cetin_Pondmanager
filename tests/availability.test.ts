import { describe, expect, it } from 'vitest'
import type { LakeClosure, Peg, Reservation } from '~/app/data/pond'
import { getPegAvailability, rangesOverlap } from '~/app/utils/availability'

const basePeg = (overrides: Partial<Peg> = {}): Peg => ({
  id: 'peg-1',
  lake: 'velky-cetin',
  label: 'Miesto 1',
  type: 'shore',
  x: 50,
  y: 50,
  capacity: 2,
  status: 'free',
  notes: 'Testovacie miesto.',
  ...overrides,
})

const baseReservation = (overrides: Partial<Reservation> = {}): Reservation => ({
  id: 'reservation-1',
  lake: 'velky-cetin',
  pegId: 'peg-1',
  guest: 'Testovací hosť',
  contactPhone: '+421 900 000 000',
  from: '2026-06-10',
  to: '2026-06-12',
  type: 'weekend',
  status: 'confirmed',
  permitId: 'permit-48h',
  rentalIds: [],
  extraIds: [],
  internalNote: 'Test.',
  source: 'web',
  ...overrides,
})

const baseClosure = (overrides: Partial<LakeClosure> = {}): LakeClosure => ({
  id: 'closure-1',
  lake: 'velky-cetin',
  title: 'Testovacia uzávierka',
  reason: 'maintenance',
  from: '2026-06-10',
  to: '2026-06-12',
  affectsReservations: true,
  visibility: 'public',
  notes: 'Test.',
  ...overrides,
})

describe('rangesOverlap', () => {
  it('treats touching date ranges as overlapping', () => {
    expect(rangesOverlap('2026-06-10', '2026-06-12', '2026-06-12', '2026-06-14')).toBe(true)
    expect(rangesOverlap('2026-06-10', '2026-06-12', '2026-06-13', '2026-06-14')).toBe(false)
  })
})

describe('getPegAvailability', () => {
  it('blocks all lake reservations during hard closures', () => {
    const result = getPegAvailability(basePeg({ lake: 'strkovisko-kocka' }), {
      closures: [
        baseClosure({
          lake: 'all',
          reason: 'season',
          title: 'Zimná prestávka',
        }),
      ],
      reservations: [],
      dateFrom: '2026-06-11',
      dateTo: '2026-06-11',
    })

    expect(result.status).toBe('closed')
    expect(result.reservable).toBe(false)
    expect(result.reasons).toContain('Zimná prestávka')
  })

  it('applies peg-specific maintenance only to targeted pegs', () => {
    const closures = [baseClosure({ pegIds: ['peg-2'], title: 'Servis móla' })]

    expect(
      getPegAvailability(basePeg({ id: 'peg-2' }), {
        closures,
        reservations: [],
        dateFrom: '2026-06-11',
      }).status,
    ).toBe('blocked')

    expect(
      getPegAvailability(basePeg({ id: 'peg-3' }), {
        closures,
        reservations: [],
        dateFrom: '2026-06-11',
      }).status,
    ).toBe('available')
  })

  it('marks confirmed, blocked and pending reservations with different statuses', () => {
    const peg = basePeg()
    const input = {
      closures: [],
      dateFrom: '2026-06-11',
      dateTo: '2026-06-11',
    }

    expect(
      getPegAvailability(peg, {
        ...input,
        reservations: [baseReservation({ status: 'confirmed' })],
      }).status,
    ).toBe('reserved')

    expect(
      getPegAvailability(peg, {
        ...input,
        reservations: [baseReservation({ status: 'blocked' })],
      }).status,
    ).toBe('blocked')

    expect(
      getPegAvailability(peg, {
        ...input,
        reservations: [baseReservation({ status: 'pending' })],
      }).status,
    ).toBe('limited')
  })

  it('keeps spawning periods reservable but requiring approval', () => {
    const result = getPegAvailability(basePeg(), {
      closures: [baseClosure({ reason: 'spawning', title: 'Neresový režim' })],
      reservations: [],
      dateFrom: '2026-06-11',
    })

    expect(result.status).toBe('requires_approval')
    expect(result.reservable).toBe(true)
  })
})
