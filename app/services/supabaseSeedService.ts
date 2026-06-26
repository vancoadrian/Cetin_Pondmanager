import type {
  Alert,
  CabinProduct,
  CatchPhoto,
  CatchRecord,
  ContactInfo,
  Lake,
  LakeClosure,
  MapFacility,
  MapLayer,
  MapShape,
  PaymentMethod,
  Peg,
  PermitProduct,
  PlaceIssue,
  RentalBooking,
  RentalItem,
  RequiredEquipmentItem,
  Reservation,
  ReservationExtra,
  Sponsor,
  Tournament,
  TournamentCatch,
  TournamentMarshal,
  TournamentPenalty,
  TournamentRequest,
  TournamentRuleCheck,
  TripLogbook,
  TripLogbookEntry,
} from '../data/pond'
export const CETIN_VENUE_SLUG = 'rybolov-cetin'
export const CETIN_VENUE_NAME = 'Rybolov Cetín'
export const CETIN_TIMEZONE = 'Europe/Bratislava'
const CETIN_LARGE_FISH_THRESHOLD_KG = 18
const CETIN_LARGE_FISH_AVAILABILITY_WINDOWS = [{
  daysOfWeek: [6, 0],
  endsAt: '18:00',
  id: 'weekend-service',
  label: 'Víkendová služba',
  startsAt: '07:00',
}]
const CETIN_LARGE_FISH_INSTRUCTION = 'Rybár privolá správcu. Správca načíta čip, uloží meranie alebo rybu označí novým čipom.'
const CETIN_LARGE_FISH_OUTSIDE_INSTRUCTION = 'Úlovok hneď zapíšte s fotkou. Mimo služby správcu nevolajte a rybu zbytočne nezadržiavajte; správca záznam preverí neskôr.'

type SeedPrimitive = string | number | boolean | null
type SeedValue = SeedPrimitive | SeedValue[] | { [key: string]: SeedValue }
export type SeedRow = Record<string, SeedValue>

export interface SupabaseSeedSource {
  alerts: Alert[]
  cabinProducts: CabinProduct[]
  catchPhotos: CatchPhoto[]
  catches: CatchRecord[]
  contactInfo: ContactInfo
  lakeClosures: LakeClosure[]
  lakes: Lake[]
  mapFacilities: MapFacility[]
  mapLayers: MapLayer[]
  mapShapes: MapShape[]
  pegs: Peg[]
  placeIssues: PlaceIssue[]
  paymentMethods: PaymentMethod[]
  permitProducts: PermitProduct[]
  rentalBookings: RentalBooking[]
  rentalItems: RentalItem[]
  requiredEquipment: RequiredEquipmentItem[]
  reservationExtras: ReservationExtra[]
  reservations: Reservation[]
  sponsors: Sponsor[]
  tournamentCatches: TournamentCatch[]
  tournamentMarshals: TournamentMarshal[]
  tournamentPenalties: TournamentPenalty[]
  tournamentRequests: TournamentRequest[]
  tournamentRuleChecks: TournamentRuleCheck[]
  tournaments: Tournament[]
  tripLogbookEntries: TripLogbookEntry[]
  tripLogbooks: TripLogbook[]
}

export interface SupabaseSeedOptions {
  baseDate?: string
  generatedAt?: string
}

export interface SupabaseSeedPayload {
  metadata: {
    baseDate: string
    counts: Record<string, number>
    generatedAt: string
    source: string
    venue: {
      id: string
      name: string
      slug: string
      timezone: string
    }
  }
  references: Record<string, Record<string, string>>
  tables: Record<string, SeedRow[]>
}

function toHex(value: number) {
  return (value >>> 0).toString(16).padStart(8, '0')
}

function hash128(value: string) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  let h3 = 0xc0decafe
  let h4 = 0x9e3779b9

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
    h3 = Math.imul(h3 ^ code, 2246822507)
    h4 = Math.imul(h4 ^ code, 3266489909)
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822507)
  h4 = Math.imul(h4 ^ (h4 >>> 13), 3266489909)

  return `${toHex(h1)}${toHex(h2)}${toHex(h3)}${toHex(h4)}`
}

export function stableSeedUuid(scope: string, key: string) {
  const chars = hash128(`${scope}:${key}`).split('')
  chars[12] = '5'
  chars[16] = ((Number.parseInt(chars[16] ?? '0', 16) & 0x3) | 0x8).toString(16)
  const hex = chars.join('')

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

function snakeValue<T extends string>(value: T) {
  return value.replaceAll('-', '_')
}

function rowId(table: string, key: string) {
  return stableSeedUuid(table, key)
}

function dateOnly(value: string) {
  return value.slice(0, 10)
}

function parseOperationalTimestamp(
  value: string | undefined,
  baseDate: string,
): string | null {
  if (!value || value === 'čaká') return null
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00+02:00`

  const todayMatch = value.match(/^dnes\s+(\d{1,2}):(\d{2})$/)
  if (todayMatch) {
    return `${baseDate}T${todayMatch[1]!.padStart(2, '0')}:${todayMatch[2]}:00+02:00`
  }

  if (value === 'pondelok') return '2026-05-18T23:59:00+02:00'

  return `${baseDate}T00:00:00+02:00`
}

function parseTournamentRange(dateRange: string) {
  const match = dateRange.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*-\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/)
  if (!match) {
    return {
      endsAt: '2026-12-31T23:59:00+01:00',
      startsAt: '2026-01-01T00:00:00+01:00',
    }
  }

  const [, startDay, startMonth, endDay, endMonth, year] = match

  return {
    endsAt: `${year}-${endMonth!.padStart(2, '0')}-${endDay!.padStart(2, '0')}T16:00:00+02:00`,
    startsAt: `${year}-${startMonth!.padStart(2, '0')}-${startDay!.padStart(2, '0')}T07:00:00+02:00`,
  }
}

function mapBy<T, K extends string>(items: T[], resolveKey: (item: T) => K, resolveId: (item: T) => string) {
  return Object.fromEntries(items.map((item) => [resolveKey(item), resolveId(item)])) as Record<K, string>
}

function uniqueValues(values: string[]) {
  return [...new Set(values)]
}

export function buildSupabaseSeedPayload(
  source: SupabaseSeedSource,
  options: SupabaseSeedOptions = {},
): SupabaseSeedPayload {
  const baseDate = options.baseDate ?? '2026-05-17'
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const venueId = rowId('venues', CETIN_VENUE_SLUG)
  const lakeIds = mapBy(source.lakes, (lake) => lake.slug, (lake) => rowId('lakes', lake.slug))
  const pegIds = mapBy(source.pegs, (peg) => peg.id, (peg) => rowId('pegs', peg.id))
  const mapFacilityIds = mapBy(
    source.mapFacilities,
    (facility) => facility.id,
    (facility) => rowId('map_facilities', facility.id),
  )
  const placeIssueIds = mapBy(
    source.placeIssues,
    (issue) => issue.id,
    (issue) => rowId('place_issues', issue.id),
  )
  const permitProductIds = mapBy(
    source.permitProducts,
    (permit) => permit.id,
    (permit) => rowId('permit_products', permit.id),
  )
  const cabinProductIds = mapBy(
    source.cabinProducts,
    (cabin) => cabin.id,
    (cabin) => rowId('cabin_products', cabin.id),
  )
  const rentalItemIds = mapBy(source.rentalItems, (item) => item.id, (item) => rowId('rental_items', item.id))
  const paymentMethodIds = mapBy(
    source.paymentMethods,
    (method) => method.id,
    (method) => rowId('payment_methods', method.id),
  )
  const reservationExtraIds = mapBy(
    source.reservationExtras,
    (extra) => extra.id,
    (extra) => rowId('reservation_extras', extra.id),
  )
  const reservationIds = mapBy(
    source.reservations,
    (reservation) => reservation.id,
    (reservation) => rowId('reservations', reservation.id),
  )
  const catchRecordIds = mapBy(source.catches, (catchItem) => catchItem.id, (catchItem) => rowId('catch_records', catchItem.id))
  const tripLogbookIds = mapBy(
    source.tripLogbooks,
    (logbook) => logbook.id,
    (logbook) => rowId('trip_logbooks', logbook.id),
  )
  const tournamentIds = mapBy(
    source.tournaments,
    (tournament) => tournament.id,
    (tournament) => rowId('tournaments', tournament.id),
  )
  const tournamentSectorIds = Object.fromEntries(
    source.tournaments.flatMap((tournament) =>
      tournament.sectors.map((sector) => [
        `${tournament.id}:${sector.id}`,
        rowId('tournament_sectors', `${tournament.id}:${sector.id}`),
      ]),
    ),
  )
  const tournamentTeamIds = Object.fromEntries(
    source.tournaments.flatMap((tournament) =>
      tournament.sectors
        .filter((sector) => sector.team)
        .map((sector) => [
          `${tournament.id}:${sector.id}`,
          rowId('tournament_teams', `${tournament.id}:${sector.id}:${sector.team}`),
        ]),
    ),
  )
  const tournamentMarshalIds = mapBy(
    source.tournamentMarshals,
    (marshal) => marshal.id,
    (marshal) => rowId('tournament_marshals', marshal.id),
  )
  const sponsorIds = mapBy(source.sponsors, (sponsor) => sponsor.id, (sponsor) => rowId('sponsors', sponsor.id))
  const sponsorAssetRefs: {
    altText: string
    id: string
    metadata: SeedValue
    sponsorId: string
    storagePath: string
  }[] = []
  for (const sponsor of source.sponsors) {
    if (sponsor.logoStoragePath) {
      sponsorAssetRefs.push({
        altText: sponsor.logoFileName ?? `Logo ${sponsor.name}`,
        id: sponsor.logoAssetId ?? sponsor.id,
        metadata: { kind: 'primary' },
        sponsorId: sponsor.id,
        storagePath: sponsor.logoStoragePath,
      })
    }

    if (sponsor.logoSourceStoragePath) {
      sponsorAssetRefs.push({
        altText: sponsor.logoSourceFileName ?? `Zdrojové logo ${sponsor.name}`,
        id: sponsor.logoSourceAssetId ?? `${sponsor.id}-source`,
        metadata: {
          height: sponsor.logoSourceHeight ?? null,
          kind: 'source',
          mimeType: sponsor.logoSourceMimeType ?? null,
          originalFileName: sponsor.logoSourceFileName ?? null,
          width: sponsor.logoSourceWidth ?? null,
        },
        sponsorId: sponsor.id,
        storagePath: sponsor.logoSourceStoragePath,
      })
    }

    for (const variant of sponsor.logoVariants ?? []) {
      if (!variant.storagePath) continue

      sponsorAssetRefs.push({
        altText: variant.fileName ?? `Logo ${sponsor.name} ${variant.placementType}`,
        id: variant.variantId ?? `${sponsor.id}-${variant.placementType}`,
        metadata: {
          cropPreset: variant.cropPreset
            ? {
                focusXPercent: variant.cropPreset.focusXPercent,
                focusYPercent: variant.cropPreset.focusYPercent,
                mode: variant.cropPreset.mode,
                paddingPercent: variant.cropPreset.paddingPercent,
                sourceFileName: variant.cropPreset.sourceFileName ?? null,
                sourceHeight: variant.cropPreset.sourceHeight ?? null,
                sourceWidth: variant.cropPreset.sourceWidth ?? null,
              }
            : null,
          kind: 'variant',
          placementType: variant.placementType,
        },
        sponsorId: sponsor.id,
        storagePath: variant.storagePath,
      })
    }
  }
  const sponsorAssetIds = mapBy(
    sponsorAssetRefs,
    (asset) => asset.id,
    (asset) => rowId('sponsor_assets', asset.id),
  )

  const teamIdFor = (tournamentId: string, sectorId: string, teamName?: string) => {
    const teamId = tournamentTeamIds[`${tournamentId}:${sectorId}`]
    if (teamId) return teamId

    const tournament = source.tournaments.find((item) => item.id === tournamentId)
    const matchingSector = tournament?.sectors.find((sector) => sector.team === teamName)

    return matchingSector ? tournamentTeamIds[`${tournamentId}:${matchingSector.id}`] ?? null : null
  }

  const tables: Record<string, SeedRow[]> = {
    alerts: source.alerts.map((alert) => ({
      body: alert.body,
      id: rowId('alerts', alert.id),
      lake_id: null,
      severity: alert.severity,
      title: alert.title,
      valid_until: parseOperationalTimestamp(alert.validUntil, baseDate),
      venue_id: venueId,
      visibility: 'public',
    })),
    cabin_product_pegs: source.cabinProducts.flatMap((cabin) =>
      cabin.pegIds.map((pegId) => ({
        cabin_product_id: cabinProductIds[cabin.id]!,
        peg_id: pegIds[pegId]!,
      })),
    ),
    cabin_products: source.cabinProducts.map((cabin) => ({
      active: true,
      capacity: cabin.capacity,
      code: cabin.id,
      equipment: cabin.equipment,
      extra_person_fee_eur: cabin.extraPersonFeeEur ?? null,
      id: cabinProductIds[cabin.id]!,
      label: cabin.label,
      minimum_hours: cabin.minimumHours,
      price_per_24h_eur: cabin.pricePer24hEur,
      requires_permit_note: cabin.requiresPermitNote,
      venue_id: venueId,
    })),
    catch_photos: source.catchPhotos.map((photo) => ({
      ai_fingerprint: {
        aiStatus: photo.aiStatus,
        notes: photo.aiNotes,
        publicUrl: photo.publicUrl,
        uploadedAt: photo.uploadedAt,
      },
      catch_record_id: catchRecordIds[photo.catchId]!,
      created_at: photo.uploadedAt,
      file_name: photo.fileName,
      id: rowId('catch_photos', photo.id),
      mime_type: photo.mimeType,
      public_url: photo.publicUrl,
      size_bytes: photo.sizeBytes,
      status: snakeValue(photo.status),
      storage_path: photo.storagePath,
    })),
    catch_records: source.catches.map((catchItem) => ({
      angler_name: catchItem.angler,
      bait: catchItem.bait,
      caught_at: catchItem.caughtAt,
      id: catchRecordIds[catchItem.id]!,
      lake_id: lakeIds[catchItem.lake]!,
      length_cm: catchItem.lengthCm,
      notes: catchItem.notes,
      peg_id: pegIds[catchItem.pegId]!,
      photo_label: catchItem.photoLabel,
      pressure_hpa: catchItem.weather?.pressureHpa ?? null,
      pressure_trend: catchItem.weather?.pressureTrend ?? '',
      released: catchItem.released,
      review_note: catchItem.reviewNote ?? '',
      reviewed_at: catchItem.reviewedAt ?? null,
      reviewed_by_label: catchItem.reviewedBy ?? '',
      species: catchItem.species,
      status: catchItem.status,
      venue_id: venueId,
      visibility: 'public',
      weather_air_temp_c: catchItem.weather?.airTempC ?? null,
      weather_cloud_cover_pct: catchItem.weather?.cloudCoverPct ?? null,
      weather_condition: catchItem.weather?.condition ?? '',
      weather_source: catchItem.weather?.source ?? '',
      weather_water_temp_c: catchItem.weather?.waterTempC ?? null,
      wind_direction: catchItem.weather?.windDirection ?? '',
      wind_kph: catchItem.weather?.windKph ?? null,
      weight_kg: catchItem.weightKg,
    })),
    lake_closure_pegs: source.lakeClosures.flatMap((closure) =>
      (closure.pegIds ?? []).map((pegId) => ({
        closure_id: rowId('lake_closures', closure.id),
        peg_id: pegIds[pegId]!,
      })),
    ),
    lake_closures: source.lakeClosures.map((closure) => ({
      affects_reservations: closure.affectsReservations,
      ends_on: closure.to,
      id: rowId('lake_closures', closure.id),
      lake_id: closure.lake === 'all' ? null : lakeIds[closure.lake],
      notes: closure.notes,
      organization: closure.organization ?? null,
      reason: closure.reason,
      starts_on: closure.from,
      title: closure.title,
      venue_id: venueId,
      visibility: closure.visibility,
    })),
    lakes: source.lakes.map((lake, index) => ({
      active: true,
      area_ha: lake.areaHa,
      facilities: lake.facilities,
      fish_stock: lake.fishStock,
      gallery_image_urls: lake.galleryImages,
      highlights: lake.highlights,
      id: lakeIds[lake.slug]!,
      image_url: lake.image,
      large_fish_availability_windows: CETIN_LARGE_FISH_AVAILABILITY_WINDOWS.map((window) => ({
        daysOfWeek: [...window.daysOfWeek],
        endsAt: window.endsAt,
        id: window.id,
        label: window.label,
        startsAt: window.startsAt,
      })),
      large_fish_contact_email: '',
      large_fish_contact_mode: 'phone',
      large_fish_contact_phone: '0911 298 702',
      large_fish_instruction: CETIN_LARGE_FISH_INSTRUCTION,
      large_fish_outside_availability_instruction: CETIN_LARGE_FISH_OUTSIDE_INSTRUCTION,
      large_fish_presence_override: null,
      large_fish_rule_enabled: true,
      large_fish_threshold_kg: CETIN_LARGE_FISH_THRESHOLD_KG,
      map_image_url: lake.mapImage ?? null,
      mode: lake.mode,
      name: lake.name,
      rules: lake.rules,
      slug: lake.slug,
      sort_order: index + 1,
      summary: lake.summary,
      venue_id: venueId,
    })),
    map_facilities: source.mapFacilities.map((facility) => ({
      id: mapFacilityIds[facility.id]!,
      label: facility.label,
      lake_id: lakeIds[facility.lake]!,
      map_x: facility.x,
      map_y: facility.y,
      notes: facility.notes,
      type: snakeValue(facility.type),
      venue_id: venueId,
      visibility: facility.visibility,
    })),
    map_layers: source.mapLayers.map((layer, index) => ({
      editable: layer.editable,
      enabled: layer.enabled,
      id: rowId('map_layers', layer.id),
      image_settings: layer.imageSettings ?? {},
      kind: layer.kind,
      lake_id: lakeIds[layer.lake]!,
      name: layer.name,
      sort_order: index + 1,
      source_url: layer.source ?? null,
      venue_id: venueId,
      visibility: layer.visibility,
    })),
    map_shapes: source.mapShapes.map((shape) => ({
      id: rowId('map_shapes', shape.id),
      label: shape.label,
      lake_id: lakeIds[shape.lake]!,
      layer_id: null,
      points: shape.points.map((point) => ({ x: point.x, y: point.y })),
      tournament_id: shape.tournamentId ? tournamentIds[shape.tournamentId] ?? null : null,
      tournament_sector_id: shape.tournamentId && shape.sectorId
        ? tournamentSectorIds[`${shape.tournamentId}:${shape.sectorId}`] ?? null
        : null,
      tone: shape.tone,
      type: shape.type,
      venue_id: venueId,
      visibility: shape.visibility,
    })),
    pegs: source.pegs.map((peg) => ({
      active: true,
      capacity: peg.capacity,
      code: peg.id,
      id: pegIds[peg.id]!,
      label: peg.label,
      lake_id: lakeIds[peg.lake]!,
      map_x: peg.x,
      map_y: peg.y,
      notes: peg.notes,
      requires_cabin_reservation: Boolean(peg.requiresCabinReservation),
      status: snakeValue(peg.status),
      type: peg.type,
      venue_id: venueId,
    })),
    place_issues: source.placeIssues.map((issue) => ({
      assigned_to: issue.assignedTo ?? null,
      category: snakeValue(issue.category),
      created_at: issue.createdAt,
      description: issue.description,
      id: placeIssueIds[issue.id]!,
      internal_note: issue.internalNote,
      lake_id: lakeIds[issue.lake]!,
      photo_label: issue.photoLabel ?? null,
      priority: issue.priority,
      reporter_name: issue.reporterName ?? null,
      reporter_phone: issue.reporterPhone ?? null,
      resolution_note: issue.resolutionNote ?? null,
      status: snakeValue(issue.status),
      target_facility_id: issue.targetType === 'facility' && issue.targetId ? mapFacilityIds[issue.targetId] ?? null : null,
      target_label: issue.targetLabel,
      target_peg_id: issue.targetType === 'peg' && issue.targetId ? pegIds[issue.targetId] ?? null : null,
      target_type: issue.targetType,
      title: issue.title,
      updated_at: issue.updatedAt,
      venue_id: venueId,
    })),
    payment_methods: source.paymentMethods.map((method) => ({
      code: method.id,
      enabled: method.enabled,
      id: paymentMethodIds[method.id]!,
      instructions: method.instructions,
      kind: method.kind === 'bank-transfer' ? 'bank_transfer' : method.kind === 'card-gateway' ? 'card_gateway' : 'cash',
      label: method.label,
      settlement: method.settlement === 'on-site' ? 'on_site' : method.settlement,
      sort_order: method.sortOrder,
      venue_id: venueId,
    })),
    permit_products: source.permitProducts.map((permit) => ({
      active: true,
      code: permit.id,
      duration_hours: permit.durationHours,
      id: permitProductIds[permit.id]!,
      label: permit.label,
      note: permit.note ?? null,
      price_eur: permit.priceEur,
      venue_id: venueId,
    })),
    rental_bookings: source.rentalBookings.map((booking) => ({
      ends_on: booking.to,
      id: rowId('rental_bookings', booking.id),
      lake_id: lakeIds[booking.lake]!,
      note: booking.note,
      quantity: booking.quantity,
      rental_item_id: rentalItemIds[booking.rentalItemId]!,
      reservation_id: reservationIds[booking.reservationId] ?? null,
      starts_on: booking.from,
      status: booking.status,
      venue_id: venueId,
    })),
    rental_items: source.rentalItems.map((item) => ({
      active: item.active,
      category: snakeValue(item.category),
      code: item.id,
      description: item.description,
      id: rentalItemIds[item.id]!,
      label: item.label,
      price_label: item.priceLabel,
      recommended: item.recommended,
      stock: item.stock,
      venue_id: venueId,
    })),
    required_equipment_items: source.requiredEquipment.map((item, index) => ({
      active: true,
      code: item.id,
      detail: item.detail,
      id: rowId('required_equipment_items', item.id),
      label: item.label,
      rentable: item.rentable,
      sort_order: index + 1,
      venue_id: venueId,
    })),
    reservation_extras: source.reservationExtras.map((extra) => ({
      active: extra.active,
      applies_to: extra.appliesTo,
      code: extra.id,
      description: extra.description,
      id: reservationExtraIds[extra.id]!,
      label: extra.label,
      lake_id: extra.lake ? lakeIds[extra.lake] : null,
      price_label: extra.priceLabel,
      source: extra.source,
      venue_id: venueId,
    })),
    reservation_items: source.reservations.flatMap((reservation) => {
      const rows: SeedRow[] = [
        {
          id: rowId('reservation_items', `${reservation.id}:permit:${reservation.permitId}`),
          item_id: permitProductIds[reservation.permitId]!,
          label: source.permitProducts.find((permit) => permit.id === reservation.permitId)?.label ?? reservation.permitId,
          quantity: 1,
          reservation_id: reservationIds[reservation.id]!,
          type: 'permit',
          unit_price_eur: source.permitProducts.find((permit) => permit.id === reservation.permitId)?.priceEur ?? null,
        },
      ]

      if (reservation.cabinProductId) {
        rows.push({
          id: rowId('reservation_items', `${reservation.id}:cabin:${reservation.cabinProductId}`),
          item_id: cabinProductIds[reservation.cabinProductId]!,
          label: source.cabinProducts.find((cabin) => cabin.id === reservation.cabinProductId)?.label ?? reservation.cabinProductId,
          quantity: 1,
          reservation_id: reservationIds[reservation.id]!,
          type: 'cabin',
          unit_price_eur: source.cabinProducts.find((cabin) => cabin.id === reservation.cabinProductId)?.pricePer24hEur ?? null,
        })
      }

      for (const rentalId of reservation.rentalIds) {
        rows.push({
          id: rowId('reservation_items', `${reservation.id}:rental:${rentalId}`),
          item_id: rentalItemIds[rentalId]!,
          label: source.rentalItems.find((item) => item.id === rentalId)?.label ?? rentalId,
          quantity: 1,
          reservation_id: reservationIds[reservation.id]!,
          type: 'rental',
          unit_price_eur: null,
        })
      }

      for (const extraId of reservation.extraIds) {
        rows.push({
          id: rowId('reservation_items', `${reservation.id}:extra:${extraId}`),
          item_id: reservationExtraIds[extraId]!,
          label: source.reservationExtras.find((extra) => extra.id === extraId)?.label ?? extraId,
          quantity: 1,
          reservation_id: reservationIds[reservation.id]!,
          type: 'extra',
          unit_price_eur: null,
        })
      }

      return rows
    }),
    reservations: source.reservations.map((reservation) => ({
      cabin_product_id: reservation.cabinProductId ? cabinProductIds[reservation.cabinProductId] ?? null : null,
      contact_phone: reservation.contactPhone,
      ends_on: reservation.to,
      guest_name: reservation.guest,
      id: reservationIds[reservation.id]!,
      internal_note: reservation.internalNote,
      lake_id: lakeIds[reservation.lake]!,
      payment_method_id: reservation.paymentMethodId ? paymentMethodIds[reservation.paymentMethodId] ?? null : null,
      payment_status: reservation.paymentStatus ?? 'unpaid',
      peg_id: pegIds[reservation.pegId]!,
      permit_product_id: permitProductIds[reservation.permitId]!,
      source: reservation.source,
      starts_on: reservation.from,
      status: reservation.status,
      type: reservation.type,
      venue_id: venueId,
    })),
    sponsor_placements: source.sponsors.map((sponsor) => ({
      active: sponsor.active,
      id: rowId('sponsor_placements', sponsor.id),
      lake_id: null,
      placement: sponsor.placement,
      sponsor_id: sponsorIds[sponsor.id]!,
      tournament_id: sponsor.tournamentId
        ? tournamentIds[sponsor.tournamentId] ?? null
        : sponsor.tier === 'tournament' ? tournamentIds[source.tournaments[0]?.id ?? ''] ?? null : null,
      venue_id: venueId,
    })),
    sponsors: source.sponsors.map((sponsor) => ({
      active: sponsor.active,
      description: sponsor.description,
      id: sponsorIds[sponsor.id]!,
      logo_text: sponsor.logoText,
      name: sponsor.name,
      tier: sponsor.tier,
      venue_id: venueId,
      website: sponsor.website ?? null,
    })),
    sponsor_assets: sponsorAssetRefs.map((asset) => ({
      alt_text: asset.altText,
      id: sponsorAssetIds[asset.id]!,
      metadata: asset.metadata,
      sponsor_id: sponsorIds[asset.sponsorId]!,
      storage_path: asset.storagePath,
    })),
    tournament_catches: source.tournamentCatches.map((catchItem) => ({
      caught_at: parseOperationalTimestamp(catchItem.caughtAt, baseDate),
      id: rowId('tournament_catches', catchItem.id),
      length_cm: catchItem.lengthCm,
      measured_at: parseOperationalTimestamp(catchItem.measuredAt, baseDate),
      notes: catchItem.notes,
      photo_label: catchItem.photoLabel,
      sector_id: tournamentSectorIds[`${catchItem.tournamentId}:${catchItem.sectorId}`]!,
      species: catchItem.species,
      status: catchItem.status,
      team_id: teamIdFor(catchItem.tournamentId, catchItem.sectorId, catchItem.team),
      tournament_id: tournamentIds[catchItem.tournamentId]!,
      verified_by_marshal_id: tournamentMarshalIds[catchItem.verifiedByMarshalId]!,
      weight_kg: catchItem.weightKg,
    })),
    tournament_marshal_sectors: source.tournamentMarshals.flatMap((marshal) =>
      marshal.assignedSectorIds.map((sectorId) => ({
        marshal_id: tournamentMarshalIds[marshal.id]!,
        sector_id: tournamentSectorIds[`${source.tournaments[0]!.id}:${sectorId}`]!,
      })),
    ),
    tournament_marshals: source.tournamentMarshals.map((marshal) => ({
      id: tournamentMarshalIds[marshal.id]!,
      name: marshal.name,
      phone: marshal.phone,
      status: snakeValue(marshal.status),
      tournament_id: tournamentIds[source.tournaments[0]!.id]!,
    })),
    tournament_organizations: [
      {
        active: true,
        contact: {},
        id: rowId('tournament_organizations', 'cetin-organizer'),
        name: 'Organizátor Cetín',
        venue_id: venueId,
      },
    ],
    tournament_penalties: source.tournamentPenalties.map((penalty) => ({
      duration_hours: penalty.durationHours ?? null,
      ends_at: parseOperationalTimestamp(penalty.endsAt, baseDate),
      id: rowId('tournament_penalties', penalty.id),
      issued_at: parseOperationalTimestamp(penalty.issuedAt, baseDate),
      issued_by_marshal_id: tournamentMarshalIds[penalty.issuedByMarshalId]!,
      reason: penalty.reason,
      rods_less: penalty.rodsLess ?? null,
      sector_id: tournamentSectorIds[`${penalty.tournamentId}:${penalty.sectorId}`]!,
      starts_at: parseOperationalTimestamp(penalty.startsAt, baseDate),
      status: penalty.status,
      team_id: teamIdFor(penalty.tournamentId, penalty.sectorId, penalty.team),
      tournament_id: tournamentIds[penalty.tournamentId]!,
      type: snakeValue(penalty.type),
    })),
    tournament_requests: source.tournamentRequests.map((request) => ({
      action_client_mutation_id: request.actionClientMutationId ?? null,
      assigned_marshal_id: request.assignedMarshalId ? tournamentMarshalIds[request.assignedMarshalId] ?? null : null,
      created_at: parseOperationalTimestamp(request.createdAt, baseDate),
      description: request.description,
      id: rowId('tournament_requests', request.id),
      priority: request.priority,
      sector_id: tournamentSectorIds[`${request.tournamentId}:${request.sectorId}`]!,
      status: request.status,
      team_id: teamIdFor(request.tournamentId, request.sectorId, request.team),
      tournament_id: tournamentIds[request.tournamentId]!,
      type: snakeValue(request.type),
    })),
    tournament_rule_checks: source.tournamentRuleChecks.map((check) => ({
      checked_at: parseOperationalTimestamp(check.checkedAt, baseDate),
      id: rowId('tournament_rule_checks', check.id),
      marshal_id: tournamentMarshalIds[check.marshalId]!,
      note: check.note,
      result: check.result,
      sector_id: tournamentSectorIds[`${check.tournamentId}:${check.sectorId}`]!,
      tournament_id: tournamentIds[check.tournamentId]!,
    })),
    tournament_sectors: source.tournaments.flatMap((tournament) =>
      tournament.sectors.map((sector) => ({
        id: tournamentSectorIds[`${tournament.id}:${sector.id}`]!,
        label: sector.label,
        map_x: sector.x,
        map_y: sector.y,
        peg_id: null,
        starting_weight_kg: sector.weightKg,
        tournament_id: tournamentIds[tournament.id]!,
      })),
    ),
    tournament_teams: source.tournaments.flatMap((tournament) =>
      tournament.sectors
        .filter((sector) => sector.team)
        .map((sector) => ({
          contact_name: null,
          contact_phone: null,
          id: tournamentTeamIds[`${tournament.id}:${sector.id}`]!,
          name: sector.team!,
          sector_id: tournamentSectorIds[`${tournament.id}:${sector.id}`]!,
          tournament_id: tournamentIds[tournament.id]!,
        })),
    ),
    tournaments: source.tournaments.map((tournament) => {
      const range = parseTournamentRange(tournament.dateRange)

      return {
        allow_external_tools: true,
        ends_at: range.endsAt,
        id: tournamentIds[tournament.id]!,
        lake_id: lakeIds[tournament.lake]!,
        name: tournament.name,
        organization_id: rowId('tournament_organizations', 'cetin-organizer'),
        rules: 'Pravidlá doplní organizátor podľa konkrétneho ročníka.',
        starts_at: range.startsAt,
        status: tournament.status,
        venue_id: venueId,
      }
    }),
    trip_logbook_entries: source.tripLogbookEntries.map((entry) => ({
      angler_name: entry.angler,
      bait: entry.bait,
      catch_record_id: entry.catchId ? catchRecordIds[entry.catchId] ?? null : null,
      caught_at: entry.caughtAt,
      id: rowId('trip_logbook_entries', entry.id),
      lake_id: lakeIds[entry.lake]!,
      length_cm: entry.lengthCm,
      logbook_id: tripLogbookIds[entry.logbookId]!,
      peg_id: pegIds[entry.pegId]!,
      photo_status: snakeValue(entry.photoStatus),
      released: entry.released,
      species: entry.species,
      verified: entry.verified,
      weight_kg: entry.weightKg,
    })),
    trip_logbook_members: source.tripLogbooks.flatMap((logbook) =>
      logbook.members.map((member) => ({
        id: rowId('trip_logbook_members', `${logbook.id}:${member.id}`),
        logbook_id: tripLogbookIds[logbook.id]!,
        name: member.name,
        role: member.role,
        // Mock account ids are not auth.users UUIDs; production import links them after signup.
        user_id: null,
      })),
    ),
    trip_logbook_pegs: source.tripLogbooks.flatMap((logbook) =>
      logbook.pegIds.map((pegId) => ({
        logbook_id: tripLogbookIds[logbook.id]!,
        peg_id: pegIds[pegId]!,
      })),
    ),
    trip_logbooks: source.tripLogbooks.map((logbook) => ({
      ends_on: dateOnly(logbook.to),
      id: tripLogbookIds[logbook.id]!,
      lake_id: lakeIds[logbook.lake]!,
      mode: logbook.mode,
      note: logbook.note,
      owner_name: logbook.owner,
      // Mock account ids are not auth.users UUIDs; production import links them after signup.
      owner_user_id: null,
      share_code: logbook.shareCode,
      starts_on: dateOnly(logbook.from),
      status: logbook.status,
      title: logbook.title,
      venue_id: venueId,
    })),
    venues: [
      {
        active: true,
        contact: {
          managerName: source.contactInfo.managerName,
          phoneDisplay: source.contactInfo.phoneDisplay,
          phoneHref: source.contactInfo.phoneHref,
          phoneHours: source.contactInfo.phoneHours,
          reservationNote: source.contactInfo.reservationNote,
          role: source.contactInfo.role,
          sourceUrl: source.contactInfo.sourceUrl,
        },
        id: venueId,
        name: CETIN_VENUE_NAME,
        slug: CETIN_VENUE_SLUG,
        timezone: CETIN_TIMEZONE,
      },
    ],
  }

  const references = {
    cabinProducts: cabinProductIds,
    catchRecords: catchRecordIds,
    catchPhotos: mapBy(source.catchPhotos, (photo) => photo.id, (photo) => rowId('catch_photos', photo.id)),
    lakes: lakeIds,
    mapFacilities: mapFacilityIds,
    pegs: pegIds,
    placeIssues: placeIssueIds,
    paymentMethods: paymentMethodIds,
    permitProducts: permitProductIds,
    rentalItems: rentalItemIds,
    reservationExtras: reservationExtraIds,
    reservations: reservationIds,
    sponsorAssets: sponsorAssetIds,
    sponsors: sponsorIds,
    tournamentMarshals: tournamentMarshalIds,
    tournamentSectors: tournamentSectorIds,
    tournamentTeams: tournamentTeamIds,
    tournaments: tournamentIds,
    tripLogbooks: tripLogbookIds,
    venue: {
      [CETIN_VENUE_SLUG]: venueId,
    },
  }

  return {
    metadata: {
      baseDate,
      counts: getSeedTableCounts(tables),
      generatedAt,
      source: 'app/data/pond.ts',
      venue: {
        id: venueId,
        name: CETIN_VENUE_NAME,
        slug: CETIN_VENUE_SLUG,
        timezone: CETIN_TIMEZONE,
      },
    },
    references,
    tables,
  }
}

export function getSeedTableCounts(tables: Record<string, SeedRow[]>) {
  return Object.fromEntries(
    Object.entries(tables)
      .sort(([tableA], [tableB]) => tableA.localeCompare(tableB))
      .map(([table, rows]) => [table, rows.length]),
  )
}

export function validateSupabaseSeedPayload(payload: SupabaseSeedPayload) {
  const messages: string[] = []
  const tableNames = Object.keys(payload.tables)
  const rowIdsByTable = Object.fromEntries(
    tableNames.map((table) => [
      table,
      new Set(
        payload.tables[table]!
          .map((row) => row.id)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ]),
  )

  for (const table of tableNames) {
    const ids = payload.tables[table]!
      .map((row) => row.id)
      .filter((id): id is string => typeof id === 'string')
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index)
    if (duplicateIds.length > 0) {
      messages.push(`${table} obsahuje duplicitné id: ${uniqueValues(duplicateIds).join(', ')}`)
    }
  }

  const requiredTables = [
    'venues',
    'lakes',
    'map_facilities',
    'map_layers',
    'map_shapes',
    'pegs',
    'place_issues',
    'reservations',
    'payment_methods',
    'reservation_items',
    'rental_items',
    'rental_bookings',
    'catch_records',
    'catch_photos',
    'trip_logbooks',
    'tournaments',
    'tournament_sectors',
    'tournament_teams',
    'tournament_marshals',
    'tournament_requests',
    'sponsors',
    'sponsor_assets',
    'sponsor_placements',
  ]

  for (const table of requiredTables) {
    if (!payload.tables[table]) messages.push(`Chýba tabuľka ${table}.`)
  }

  const lakeIds = rowIdsByTable.lakes ?? new Set<string>()
  const mapFacilityIds = rowIdsByTable.map_facilities ?? new Set<string>()
  const pegIds = rowIdsByTable.pegs ?? new Set<string>()
  const reservationIds = rowIdsByTable.reservations ?? new Set<string>()
  const tournamentIds = rowIdsByTable.tournaments ?? new Set<string>()

  for (const peg of payload.tables.pegs ?? []) {
    if (typeof peg.lake_id === 'string' && !lakeIds.has(peg.lake_id)) {
      messages.push(`Lovné miesto ${peg.code} odkazuje na neznáme jazero.`)
    }
  }

  for (const reservation of payload.tables.reservations ?? []) {
    if (typeof reservation.lake_id === 'string' && !lakeIds.has(reservation.lake_id)) {
      messages.push(`Rezervácia ${reservation.id} odkazuje na neznáme jazero.`)
    }
    if (typeof reservation.peg_id === 'string' && !pegIds.has(reservation.peg_id)) {
      messages.push(`Rezervácia ${reservation.id} odkazuje na neznáme miesto.`)
    }
  }

  for (const issue of payload.tables.place_issues ?? []) {
    if (typeof issue.lake_id === 'string' && !lakeIds.has(issue.lake_id)) {
      messages.push(`Hlásenie nedostatku ${issue.id} odkazuje na neznáme jazero.`)
    }
    if (typeof issue.target_peg_id === 'string' && !pegIds.has(issue.target_peg_id)) {
      messages.push(`Hlásenie nedostatku ${issue.id} odkazuje na neznáme lovné miesto.`)
    }
    if (typeof issue.target_facility_id === 'string' && !mapFacilityIds.has(issue.target_facility_id)) {
      messages.push(`Hlásenie nedostatku ${issue.id} odkazuje na neznámy servisný bod.`)
    }
  }

  for (const item of payload.tables.reservation_items ?? []) {
    if (typeof item.reservation_id === 'string' && !reservationIds.has(item.reservation_id)) {
      messages.push(`Položka rezervácie ${item.id} odkazuje na neznámu rezerváciu.`)
    }
  }

  for (const tournament of payload.tables.tournaments ?? []) {
    if (typeof tournament.lake_id === 'string' && !lakeIds.has(tournament.lake_id)) {
      messages.push(`Súťaž ${tournament.id} odkazuje na neznáme jazero.`)
    }
  }

  for (const sector of payload.tables.tournament_sectors ?? []) {
    if (typeof sector.tournament_id === 'string' && !tournamentIds.has(sector.tournament_id)) {
      messages.push(`Sektor ${sector.id} odkazuje na neznámu súťaž.`)
    }
  }

  return {
    messages,
    ok: messages.length === 0,
  }
}
