import { describe, expect, it } from 'vitest'
import type { CabinProduct, Peg, Reservation } from '~/app/data/pond'
import { updateCabinCatalogSettings } from '~/app/services/cabinCatalogService'

const peg = (overrides: Partial<Peg> = {}): Peg => ({
  capacity: 2,
  id: 'vc-03',
  lake: 'velky-cetin',
  label: 'Chata 3',
  notes: 'Test.',
  requiresCabinReservation: true,
  status: 'free',
  type: 'cabin',
  x: 50,
  y: 50,
  ...overrides,
})

const cabinProduct = (overrides: Partial<CabinProduct> = {}): CabinProduct => ({
  capacity: 4,
  equipment: ['posteľ', 'kuchyňa'],
  id: 'large-cabin',
  label: 'Veľká chata',
  minimumHours: 48,
  pegIds: ['vc-03'],
  pricePer24hEur: 70,
  requiresPermitNote: 'Vyžaduje 48h povolenku.',
  ...overrides,
})

const reservation = (overrides: Partial<Reservation> = {}): Reservation => ({
  contactPhone: '+421900000000',
  extraIds: [],
  from: '2026-06-10',
  guest: 'Testovací hosť',
  id: 'reservation-1',
  internalNote: '',
  lake: 'velky-cetin',
  pegId: 'vc-03',
  permitId: 'permit-48h',
  rentalIds: [],
  source: 'web',
  status: 'confirmed',
  to: '2026-06-12',
  type: 'weekend',
  ...overrides,
})

describe('updateCabinCatalogSettings', () => {
  it('updates cabin to peg links', () => {
    const result = updateCabinCatalogSettings(
      {
        cabinProducts: [
          cabinProduct({ pegIds: ['vc-06'] }),
        ],
      },
      {
        cabinProducts: [cabinProduct()],
        pegs: [peg(), peg({ id: 'vc-06', label: 'Chata 6' })],
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Cabin catalog should update.')

    expect(result.cabinProducts[0]?.pegIds).toEqual(['vc-06'])
  })

  it('rejects one peg linked to multiple cabin products', () => {
    const result = updateCabinCatalogSettings(
      {
        cabinProducts: [
          cabinProduct({ id: 'large-cabin', pegIds: ['vc-03'] }),
          cabinProduct({ id: 'small-cabin', label: 'Malá chata', pegIds: ['vc-03'] }),
        ],
      },
      {
        cabinProducts: [cabinProduct()],
        pegs: [peg()],
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Duplicate peg assignment should fail.')

    expect(result.messages).toContain('Lovné miesto je priradené k viacerým chatám: vc-03.')
  })

  it('rejects links to non-cabin pegs and missing pegs', () => {
    const result = updateCabinCatalogSettings(
      {
        cabinProducts: [
          cabinProduct({ pegIds: ['vc-01', 'missing-peg'] }),
        ],
      },
      {
        cabinProducts: [cabinProduct()],
        pegs: [peg({ id: 'vc-01', label: 'Miesto 1', requiresCabinReservation: undefined, type: 'shore' })],
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Invalid peg links should fail.')

    expect(result.messages).toContain('Lovné miesto pre chatu neexistuje: missing-peg.')
    expect(result.messages).toContain('Lovné miesto nie je označené ako miesto s chatou: vc-01.')
  })

  it('keeps existing reservation cabin products available', () => {
    const result = updateCabinCatalogSettings(
      {
        cabinProducts: [
          cabinProduct({ id: 'small-cabin' }),
        ],
      },
      {
        cabinProducts: [cabinProduct()],
        pegs: [peg()],
        reservations: [reservation({ cabinProductId: 'large-cabin' })],
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Removing used cabin product should fail.')

    expect(result.messages).toContain('Chatu nemožno odstrániť, je použitá v rezerváciách: large-cabin.')
  })
})
