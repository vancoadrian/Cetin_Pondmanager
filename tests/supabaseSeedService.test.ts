import { describe, expect, it } from 'vitest'
import {
  alerts,
  cabinProducts,
  catchPhotos,
  catches,
  contactInfo,
  lakeClosures,
  lakes,
  mapFacilities,
  mapLayers,
  mapShapes,
  pegs,
  paymentMethods,
  permitProducts,
  rentalBookings,
  rentalItems,
  requiredEquipment,
  reservationExtras,
  reservations,
  sponsors,
  tournamentCatches,
  tournamentMarshals,
  tournamentPenalties,
  tournamentRequests,
  tournamentRuleChecks,
  tournaments,
  tripLogbookEntries,
  tripLogbooks,
} from '~/app/data/pond'
import {
  buildSupabaseSeedPayload,
  stableSeedUuid,
  validateSupabaseSeedPayload,
  type SupabaseSeedSource,
} from '~/app/services/supabaseSeedService'

const createSource = (): SupabaseSeedSource => ({
  alerts,
  cabinProducts,
  catchPhotos,
  catches,
  contactInfo,
  lakeClosures,
  lakes,
  mapFacilities,
  mapLayers,
  mapShapes,
  pegs,
  paymentMethods,
  permitProducts,
  rentalBookings,
  rentalItems,
  requiredEquipment,
  reservationExtras,
  reservations,
  sponsors,
  tournamentCatches,
  tournamentMarshals,
  tournamentPenalties,
  tournamentRequests,
  tournamentRuleChecks,
  tournaments,
  tripLogbookEntries,
  tripLogbooks,
})

describe('supabaseSeedService', () => {
  it('creates deterministic UUIDs for seed references', () => {
    expect(stableSeedUuid('venues', 'rybolov-cetin')).toBe(stableSeedUuid('venues', 'rybolov-cetin'))
    expect(stableSeedUuid('venues', 'rybolov-cetin')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('maps current Cetin mock data into Supabase-shaped seed tables', () => {
    const payload = buildSupabaseSeedPayload(createSource(), {
      baseDate: '2026-05-17',
      generatedAt: '2026-05-17T12:00:00.000Z',
    })

    expect(payload.metadata.venue).toMatchObject({
      name: 'Rybolov Cetín',
      slug: 'rybolov-cetin',
      timezone: 'Europe/Bratislava',
    })
    expect(payload.tables.lakes).toHaveLength(lakes.length)
    expect(payload.tables.map_facilities).toHaveLength(mapFacilities.length)
    expect(payload.tables.pegs).toHaveLength(pegs.length)
    expect(payload.tables.reservations).toHaveLength(reservations.length)
    expect(payload.tables.payment_methods).toHaveLength(paymentMethods.length)
    expect(payload.tables.catch_photos).toHaveLength(catchPhotos.length)
    expect(payload.tables.tournament_sectors).toHaveLength(tournaments[0]!.sectors.length)
    expect(payload.tables.tournament_teams).toHaveLength(tournaments[0]!.sectors.filter((sector) => sector.team).length)
    expect(payload.tables.map_layers[0]?.image_settings).toMatchObject({
      fit: 'cover',
      opacity: 0.9,
    })
    expect(payload.tables.cabin_product_pegs).toHaveLength(
      cabinProducts.reduce((sum, cabin) => sum + cabin.pegIds.length, 0),
    )
    expect(payload.tables.map_shapes.some((shape) => shape.tournament_sector_id)).toBe(true)
    expect(payload.tables.venues[0]?.contact).toMatchObject({
      managerName: contactInfo.managerName,
      phoneDisplay: contactInfo.phoneDisplay,
    })
  })

  it('validates local relationships before export', () => {
    const payload = buildSupabaseSeedPayload(createSource(), {
      baseDate: '2026-05-17',
      generatedAt: '2026-05-17T12:00:00.000Z',
    })
    const validation = validateSupabaseSeedPayload(payload)

    expect(validation).toEqual({
      messages: [],
      ok: true,
    })
  })

  it('exports sponsor asset crop metadata for generated logo variants', () => {
    const source = createSource()
    source.sponsors = source.sponsors.map((sponsor, index) =>
      index === 0
        ? {
            ...sponsor,
            logoVariants: [{
              cropPreset: {
                focusXPercent: 35,
                focusYPercent: 70,
                mode: 'cover',
                paddingPercent: 8,
                sourceFileName: 'source.png',
                sourceHeight: 500,
                sourceWidth: 1200,
              },
              fileName: 'homepage.png',
              height: 240,
              mimeType: 'image/png',
              placementType: 'homepage',
              sizeBytes: 5,
              storagePath: 'sponsor-assets/homepage.png',
              url: '/api/sponsor-assets/homepage',
              variantId: 'homepage',
              width: 720,
            }],
          }
        : sponsor,
    )
    const payload = buildSupabaseSeedPayload(source, {
      baseDate: '2026-05-17',
      generatedAt: '2026-05-17T12:00:00.000Z',
    })

    const asset = payload.tables.sponsor_assets.find((item) => item.storage_path === 'sponsor-assets/homepage.png')
    expect(asset?.metadata).toEqual({
      cropPreset: {
        focusXPercent: 35,
        focusYPercent: 70,
        mode: 'cover',
        paddingPercent: 8,
        sourceFileName: 'source.png',
        sourceHeight: 500,
        sourceWidth: 1200,
      },
      kind: 'variant',
      placementType: 'homepage',
    })
  })

  it('exports reusable sponsor source logos as source assets', () => {
    const source = createSource()
    source.sponsors = source.sponsors.map((sponsor, index) =>
      index === 0
        ? {
            ...sponsor,
            logoSourceAssetId: 'source-carpgear',
            logoSourceFileName: 'carpgear-source.png',
            logoSourceHeight: 420,
            logoSourceMimeType: 'image/png',
            logoSourceSizeBytes: 5,
            logoSourceStoragePath: 'sponsor-assets/source-carpgear.png',
            logoSourceUrl: '/api/sponsor-assets/source-carpgear',
            logoSourceWidth: 1280,
          }
        : sponsor,
    )
    const payload = buildSupabaseSeedPayload(source, {
      baseDate: '2026-05-17',
      generatedAt: '2026-05-17T12:00:00.000Z',
    })

    const asset = payload.tables.sponsor_assets.find((item) => item.storage_path === 'sponsor-assets/source-carpgear.png')
    expect(asset?.alt_text).toBe('carpgear-source.png')
    expect(asset?.metadata).toEqual({
      height: 420,
      kind: 'source',
      mimeType: 'image/png',
      originalFileName: 'carpgear-source.png',
      width: 1280,
    })
  })

  it('normalizes enum values that differ between the UI model and database model', () => {
    const payload = buildSupabaseSeedPayload(createSource(), {
      baseDate: '2026-05-17',
      generatedAt: '2026-05-17T12:00:00.000Z',
    })
    const weekendPeg = payload.tables.pegs.find((peg) => peg.code === 'vc-03')
    const marshalOnRoute = payload.tables.tournament_marshals.find((marshal) => marshal.name === 'Peter H.')
    const catchMeasurementRequest = payload.tables.tournament_requests.find((request) => request.type === 'catch_measurement')
    const bankTransfer = payload.tables.payment_methods.find((method) => method.code === 'bank-transfer')
    const approvedCatch = payload.tables.catch_records.find((catchItem) => catchItem.status === 'approved')

    expect(weekendPeg?.status).toBe('weekend_free')
    expect(marshalOnRoute?.status).toBe('on_route')
    expect(catchMeasurementRequest).toBeTruthy()
    expect(bankTransfer?.kind).toBe('bank_transfer')
    expect(approvedCatch).toBeTruthy()
    expect(approvedCatch).toHaveProperty('review_note')
    expect(approvedCatch).toHaveProperty('reviewed_by_label')
    expect(approvedCatch).toHaveProperty('weather_condition')
    expect(approvedCatch).toHaveProperty('pressure_hpa')
  })
})
