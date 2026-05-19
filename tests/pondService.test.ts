import { describe, expect, it } from 'vitest'
import type { LakeClosure, LakeSlug, Peg, Reservation } from '~/app/data/pond'
import { createMockPondRepository, type PondRepository } from '~/app/repositories/pondRepository'
import { createPondService } from '~/app/services/pondService'

describe('createMockPondRepository seed contract', () => {
  it('keeps reservation references connected to existing seed records', () => {
    const snapshot = createMockPondRepository().getSnapshot()
    const lakeSlugs = new Set(snapshot.lakes.map((lake) => lake.slug))
    const pegIds = new Set(snapshot.pegs.map((peg) => peg.id))
    const permitIds = new Set(snapshot.permitProducts.map((permit) => permit.id))
    const cabinProductIds = new Set(snapshot.cabinProducts.map((cabin) => cabin.id))
    const rentalItemIds = new Set(snapshot.rentalItems.map((item) => item.id))
    const extraIds = new Set(snapshot.reservationExtras.map((extra) => extra.id))

    for (const reservation of snapshot.reservations) {
      expect(lakeSlugs.has(reservation.lake), `${reservation.id} references an unknown lake`).toBe(true)
      expect(pegIds.has(reservation.pegId), `${reservation.id} references an unknown peg`).toBe(true)
      expect(permitIds.has(reservation.permitId), `${reservation.id} references an unknown permit`).toBe(true)

      if (reservation.cabinProductId) {
        expect(
          cabinProductIds.has(reservation.cabinProductId),
          `${reservation.id} references an unknown cabin product`,
        ).toBe(true)
      }

      for (const rentalId of reservation.rentalIds) {
        expect(rentalItemIds.has(rentalId), `${reservation.id} references an unknown rental item`).toBe(true)
      }

      for (const extraId of reservation.extraIds) {
        expect(extraIds.has(extraId), `${reservation.id} references an unknown extra`).toBe(true)
      }
    }
  })

  it('keeps rental bookings connected to existing reservations and rental items', () => {
    const snapshot = createMockPondRepository().getSnapshot()
    const reservationIds = new Set(snapshot.reservations.map((reservation) => reservation.id))
    const rentalItemIds = new Set(snapshot.rentalItems.map((item) => item.id))

    for (const booking of snapshot.rentalBookings) {
      expect(reservationIds.has(booking.reservationId), `${booking.id} references an unknown reservation`).toBe(true)
      expect(rentalItemIds.has(booking.rentalItemId), `${booking.id} references an unknown rental item`).toBe(true)
      expect(booking.to >= booking.from, `${booking.id} has an invalid date range`).toBe(true)
      expect(booking.quantity).toBeGreaterThan(0)
    }
  })
})

describe('createPondService', () => {
  const lakes = [
    {
      slug: 'velky-cetin' as const,
      name: 'Veľký Cetín',
      areaHa: 12,
      mode: 'test',
      summary: 'Test.',
      highlights: [],
      facilities: [],
      fishStock: [],
      rules: [],
      image: '/test.jpg',
      galleryImages: [],
    },
    {
      slug: 'strkovisko-kocka' as const,
      name: 'Štrkovisko Kocka',
      areaHa: 4,
      mode: 'test',
      summary: 'Test.',
      highlights: [],
      facilities: [],
      fishStock: [],
      rules: [],
      image: '/test.jpg',
      galleryImages: [],
    },
  ]

  const pegs: Peg[] = [
    {
      id: 'vc-01',
      lake: 'velky-cetin',
      label: 'Miesto 1',
      type: 'shore',
      x: 10,
      y: 10,
      capacity: 2,
      status: 'free',
      notes: 'Test.',
    },
    {
      id: 'sk-01',
      lake: 'strkovisko-kocka',
      label: 'Kocka 1',
      type: 'shore',
      x: 20,
      y: 20,
      capacity: 2,
      status: 'free',
      notes: 'Test.',
    },
  ]

  const reservations: Reservation[] = [
    {
      id: 'reservation-vc',
      lake: 'velky-cetin',
      pegId: 'vc-01',
      guest: 'Hosť VC',
      contactPhone: '+421 900 111 222',
      from: '2026-06-10',
      to: '2026-06-12',
      type: 'weekend',
      status: 'confirmed',
      permitId: 'permit-48h',
      rentalIds: [],
      extraIds: [],
      internalNote: 'Test.',
      source: 'admin',
    },
    {
      id: 'reservation-sk',
      lake: 'strkovisko-kocka',
      pegId: 'sk-01',
      guest: 'Hosť SK',
      contactPhone: '+421 900 333 444',
      from: '2026-06-10',
      to: '2026-06-12',
      type: 'weekend',
      status: 'pending',
      permitId: 'permit-48h',
      rentalIds: [],
      extraIds: [],
      internalNote: 'Test.',
      source: 'web',
    },
  ]

  const lakeClosures: LakeClosure[] = [
    {
      id: 'closure-all',
      lake: 'all',
      title: 'Celý areál',
      reason: 'season',
      from: '2026-12-01',
      to: '2027-02-01',
      affectsReservations: true,
      visibility: 'public',
      notes: 'Test.',
    },
    {
      id: 'closure-vc',
      lake: 'velky-cetin',
      title: 'Veľký Cetín',
      reason: 'maintenance',
      from: '2026-06-01',
      to: '2026-06-02',
      affectsReservations: true,
      visibility: 'internal',
      notes: 'Test.',
    },
  ]

  const repository: PondRepository = {
    getSnapshot: () => ({
      alerts: [],
      cabinProducts: [],
      catchPhotos: [],
      catches: [],
      contactInfo: {
        managerName: 'Správca',
        role: 'test',
        phoneDisplay: '0900 000 000',
        phoneHref: '+421900000000',
        reservationNote: 'Test.',
        phoneHours: [],
        sourceUrl: 'https://example.com',
      },
      infoSections: [],
      lakeClosures,
      lakes,
      mapLayers: [],
      mapShapes: [],
      occupancyLegend: [],
      pegs,
      paymentMethods: [],
      permitProducts: [],
      rentalBookings: [],
      rentalItems: [],
      requiredEquipment: [],
      reservationExtras: [],
      reservations,
      sponsors: [],
      tournamentCatches: [],
      tournamentMarshalStatusLabels: {},
      tournamentMarshals: [],
      tournamentPenalties: [],
      tournamentPenaltyTypeLabels: {},
      tournamentRequests: [],
      tournamentRequestStatusLabels: {},
      tournamentRequestTypeLabels: {},
      tournamentRuleChecks: [],
      tournaments: [],
      tripLogbookEntries: [],
      tripLogbookModeLabels: {},
      tripLogbooks: [],
      tripLogbookStatusLabels: {},
    }),
    getLakeName: (slug: LakeSlug) => lakes.find((lake) => lake.slug === slug)?.name || slug,
    getPegLabel: (id: string) => pegs.find((peg) => peg.id === id)?.label || id,
  }

  it('exposes repository data plus convenience selectors', () => {
    const service = createPondService(repository)

    expect(service.getLakeBySlug('velky-cetin')?.name).toBe('Veľký Cetín')
    expect(service.getLakeName('strkovisko-kocka')).toBe('Štrkovisko Kocka')
    expect(service.getPegLabel('vc-01')).toBe('Miesto 1')
    expect(service.listPegsByLake('velky-cetin')).toHaveLength(1)
    expect(service.listMapLayersByLake('velky-cetin')).toEqual([])
    expect(service.listMapShapesByLake('velky-cetin')).toEqual([])
  })

  it('filters lake-specific reservations and includes all-lake closures', () => {
    const service = createPondService(repository)

    expect(service.listReservationsByLake('velky-cetin').map((reservation) => reservation.id)).toEqual([
      'reservation-vc',
    ])
    expect(service.listClosuresByLake('velky-cetin').map((closure) => closure.id)).toEqual([
      'closure-all',
      'closure-vc',
    ])
    expect(service.listClosuresByLake('strkovisko-kocka').map((closure) => closure.id)).toEqual(['closure-all'])
  })
})
