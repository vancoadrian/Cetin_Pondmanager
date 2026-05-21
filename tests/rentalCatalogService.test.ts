import { describe, expect, it } from 'vitest'
import type { RentalItem, ReservationExtra } from '~/app/data/pond'
import { updateRentalCatalogSettings } from '~/app/services/rentalCatalogService'

const rentalItem = (overrides: Partial<RentalItem> = {}): RentalItem => ({
  id: 'landing-net-rental',
  label: 'Podberák',
  category: 'fish-care',
  description: 'Testovacia výbava.',
  stock: 3,
  priceLabel: 'cena po potvrdení',
  recommended: true,
  active: true,
  ...overrides,
})

const reservationExtra = (overrides: Partial<ReservationExtra> = {}): ReservationExtra => ({
  id: 'wood-crate',
  label: 'Bednička dreva',
  description: 'Testovací doplnok.',
  appliesTo: 'cabin',
  priceLabel: 'podľa dohody',
  source: 'proposal',
  active: true,
  ...overrides,
})

describe('updateRentalCatalogSettings', () => {
  it('updates stock, recommendation and active flags while preserving metadata', () => {
    const result = updateRentalCatalogSettings(
      {
        rentalItems: [{
          active: false,
          id: 'landing-net-rental',
          priceLabel: '5 € / pobyt',
          recommended: false,
          stock: 2,
        }],
        reservationExtras: [{
          active: true,
          id: 'wood-crate',
          priceLabel: '8 € / bednička',
          source: 'web',
        }],
      },
      {
        rentalItems: [rentalItem()],
        reservationExtras: [reservationExtra()],
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Catalog update should be valid.')

    expect(result.rentalItems[0]).toMatchObject({
      active: false,
      category: 'fish-care',
      id: 'landing-net-rental',
      priceLabel: '5 € / pobyt',
      recommended: false,
      stock: 2,
    })
    expect(result.reservationExtras[0]).toMatchObject({
      active: true,
      appliesTo: 'cabin',
      priceLabel: '8 € / bednička',
      source: 'web',
    })
  })

  it('rejects unknown rental and extra ids', () => {
    const result = updateRentalCatalogSettings(
      {
        rentalItems: [{
          active: true,
          id: 'missing-rental',
          priceLabel: 'cena',
          recommended: false,
          stock: 1,
        }],
        reservationExtras: [{
          active: true,
          id: 'missing-extra',
          priceLabel: 'cena',
          source: 'proposal',
        }],
      },
      {
        rentalItems: [rentalItem()],
        reservationExtras: [reservationExtra()],
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Catalog update should be invalid.')

    expect(result.statusCode).toBe(404)
    expect(result.messages).toContain('Výbava v katalógu neexistuje: missing-rental.')
    expect(result.messages).toContain('Doplnok v katalógu neexistuje: missing-extra.')
  })

  it('rejects a catalog with everything disabled', () => {
    const result = updateRentalCatalogSettings(
      {
        rentalItems: [{
          active: false,
          id: 'landing-net-rental',
          priceLabel: 'cena',
          recommended: false,
          stock: 1,
        }],
        reservationExtras: [{
          active: false,
          id: 'wood-crate',
          priceLabel: 'cena',
          source: 'proposal',
        }],
      },
      {
        rentalItems: [rentalItem()],
        reservationExtras: [reservationExtra()],
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Catalog update should be invalid.')

    expect(result.messages).toContain('Zapnite aspoň jednu položku požičovne alebo doplnok k rezervácii.')
  })
})
