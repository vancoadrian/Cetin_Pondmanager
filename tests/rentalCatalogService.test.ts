import { describe, expect, it } from 'vitest'
import type { RentalBooking, RentalItem, Reservation, ReservationExtra } from '~/app/data/pond'
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

const reservation = (overrides: Partial<Reservation> = {}): Reservation => ({
  id: 'r-usage-test',
  lake: 'velky-cetin',
  pegId: 'vc-01',
  guest: 'Testovací hosť',
  contactPhone: '+421900000000',
  from: '2026-05-16',
  to: '2026-05-18',
  type: 'weekend',
  status: 'confirmed',
  permitId: 'permit-24h',
  rentalIds: [],
  extraIds: [],
  internalNote: '',
  source: 'admin',
  ...overrides,
})

const rentalBooking = (overrides: Partial<RentalBooking> = {}): RentalBooking => ({
  id: 'rb-usage-test',
  reservationId: 'r-usage-test',
  rentalItemId: 'landing-net-rental',
  lake: 'velky-cetin',
  from: '2026-05-16',
  to: '2026-05-18',
  quantity: 1,
  status: 'reserved',
  note: 'Testovacia výpožička.',
  ...overrides,
})

describe('updateRentalCatalogSettings', () => {
  it('updates stock, recommendation and active flags while preserving metadata', () => {
    const result = updateRentalCatalogSettings(
      {
        rentalItems: [{
          active: false,
          category: 'fish-care',
          description: 'Upravený popis výbavy.',
          id: 'landing-net-rental',
          label: 'Podberák XL',
          priceLabel: '5 € / pobyt',
          recommended: false,
          stock: 2,
        }],
        reservationExtras: [{
          active: true,
          appliesTo: 'cabin',
          description: 'Upravený popis doplnku.',
          id: 'wood-crate',
          label: 'Drevo pri chate',
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
      description: 'Upravený popis výbavy.',
      id: 'landing-net-rental',
      label: 'Podberák XL',
      priceLabel: '5 € / pobyt',
      recommended: false,
      stock: 2,
    })
    expect(result.reservationExtras[0]).toMatchObject({
      active: true,
      appliesTo: 'cabin',
      description: 'Upravený popis doplnku.',
      label: 'Drevo pri chate',
      priceLabel: '8 € / bednička',
      source: 'web',
    })
  })

  it('adds new rental and extra records to the catalog', () => {
    const result = updateRentalCatalogSettings(
      {
        rentalItems: [{
          active: true,
          category: 'comfort',
          description: 'Skladacia stolička pre dlhšie sedenie pri vode.',
          id: 'rental-chair',
          label: 'Skladacia stolička',
          priceLabel: '3 € / pobyt',
          recommended: false,
          stock: 4,
        }],
        reservationExtras: [{
          active: true,
          appliesTo: 'all',
          description: 'Balík ľadu pripravený pri príchode.',
          id: 'extra-ice-pack',
          label: 'Ľad do chladiaceho boxu',
          priceLabel: '2 € / balík',
          source: 'proposal',
        }],
      },
      {
        rentalItems: [rentalItem()],
        reservationExtras: [reservationExtra()],
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Catalog update should be valid.')

    expect(result.rentalItems.find((item) => item.id === 'rental-chair')).toMatchObject({
      active: true,
      category: 'comfort',
      label: 'Skladacia stolička',
      stock: 4,
    })
    expect(result.reservationExtras.find((extra) => extra.id === 'extra-ice-pack')).toMatchObject({
      active: true,
      appliesTo: 'all',
      label: 'Ľad do chladiaceho boxu',
    })
    expect(result.message).toContain('pribudlo 1 položiek výbavy a 1 doplnkov')
  })

  it('removes unused rental and extra records from the catalog', () => {
    const result = updateRentalCatalogSettings(
      {
        removeRentalItemIds: ['rental-chair'],
        removeReservationExtraIds: ['extra-ice-pack'],
        rentalItems: [rentalItem()],
        reservationExtras: [reservationExtra()],
      },
      {
        rentalItems: [
          rentalItem(),
          rentalItem({
            category: 'comfort',
            description: 'Skladacia stolička pre dlhšie sedenie pri vode.',
            id: 'rental-chair',
            label: 'Skladacia stolička',
            recommended: false,
            stock: 4,
          }),
        ],
        reservationExtras: [
          reservationExtra(),
          reservationExtra({
            appliesTo: 'all',
            description: 'Balík ľadu pripravený pri príchode.',
            id: 'extra-ice-pack',
            label: 'Ľad do chladiaceho boxu',
          }),
        ],
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Catalog update should be valid.')

    expect(result.removedRentalItemIds).toEqual(['rental-chair'])
    expect(result.removedReservationExtraIds).toEqual(['extra-ice-pack'])
    expect(result.rentalItems.map((item) => item.id)).not.toContain('rental-chair')
    expect(result.reservationExtras.map((extra) => extra.id)).not.toContain('extra-ice-pack')
    expect(result.message).toContain('odstránené položky')
  })

  it('rejects removing records that are already used by reservations or rental bookings', () => {
    const result = updateRentalCatalogSettings(
      {
        removeRentalItemIds: ['landing-net-rental'],
        removeReservationExtraIds: ['wood-crate'],
        rentalItems: [
          rentalItem({
            category: 'comfort',
            description: 'Skladacia stolička pre dlhšie sedenie pri vode.',
            id: 'rental-chair',
            label: 'Skladacia stolička',
            recommended: false,
            stock: 4,
          }),
        ],
        reservationExtras: [
          reservationExtra({
            appliesTo: 'all',
            description: 'Balík ľadu pripravený pri príchode.',
            id: 'extra-ice-pack',
            label: 'Ľad do chladiaceho boxu',
          }),
        ],
      },
      {
        rentalBookings: [rentalBooking()],
        rentalItems: [
          rentalItem(),
          rentalItem({
            category: 'comfort',
            description: 'Skladacia stolička pre dlhšie sedenie pri vode.',
            id: 'rental-chair',
            label: 'Skladacia stolička',
            recommended: false,
            stock: 4,
          }),
        ],
        reservations: [
          reservation({
            extraIds: ['wood-crate'],
            rentalIds: ['landing-net-rental'],
          }),
        ],
        reservationExtras: [
          reservationExtra(),
          reservationExtra({
            appliesTo: 'all',
            description: 'Balík ľadu pripravený pri príchode.',
            id: 'extra-ice-pack',
            label: 'Ľad do chladiaceho boxu',
          }),
        ],
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Catalog update should be invalid.')

    expect(result.messages).toContain(
      'Výbavu nemožno odstrániť, je použitá v rezerváciách alebo výpožičkách: Podberák (landing-net-rental). Položku radšej vypnite.',
    )
    expect(result.messages).toContain(
      'Doplnok nemožno odstrániť, je použitý v rezerváciách: Bednička dreva (wood-crate). Doplnok radšej vypnite.',
    )
  })

  it('rejects a catalog with everything disabled', () => {
    const result = updateRentalCatalogSettings(
      {
        rentalItems: [{
          active: false,
          category: 'fish-care',
          description: 'Testovacia výbava.',
          id: 'landing-net-rental',
          label: 'Podberák',
          priceLabel: 'cena',
          recommended: false,
          stock: 1,
        }],
        reservationExtras: [{
          active: false,
          appliesTo: 'cabin',
          description: 'Testovací doplnok.',
          id: 'wood-crate',
          label: 'Bednička dreva',
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
