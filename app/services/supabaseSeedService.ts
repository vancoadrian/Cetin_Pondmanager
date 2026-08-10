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
import { buildCatchReferenceIds, buildCatchTables } from './supabaseSeedCatchService.ts'
import { buildCommerceReferenceIds, buildCommerceTables } from './supabaseSeedCommerceService.ts'
import {
  CETIN_TIMEZONE,
  CETIN_VENUE_NAME,
  CETIN_VENUE_SLUG,
  mapBy,
  rowId,
  type SeedRow,
} from './supabaseSeedShared.ts'
import { buildSponsorReferenceIds, buildSponsorTables } from './supabaseSeedSponsorService.ts'
import { buildTournamentReferenceIds, buildTournamentTables } from './supabaseSeedTournamentService.ts'
import { buildVenueReferenceIds, buildVenueTables } from './supabaseSeedVenueService.ts'

export { stableSeedUuid } from './supabaseSeedShared.ts'
export type { SeedRow } from './supabaseSeedShared.ts'

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

  // Reference ids for every entity group are pure derivations of `source`
  // (via stableSeedUuid), so they can all be resolved independently of one
  // another before any table is built — this is what lets the venue/map
  // tables (which need tournament ids for map_shapes) and the tournament
  // tables (which need lake ids) be built in either order below.
  const venueRefs = buildVenueReferenceIds(source)
  const commerceRefs = buildCommerceReferenceIds(source)
  const catchRefs = buildCatchReferenceIds(source)
  const tournamentRefs = buildTournamentReferenceIds(source)
  const sponsorRefs = buildSponsorReferenceIds(source)

  const venueTables = buildVenueTables(source, {
    baseDate,
    lakeIds: venueRefs.lakeIds,
    mapFacilityIds: venueRefs.mapFacilityIds,
    pegIds: venueRefs.pegIds,
    placeIssueIds: venueRefs.placeIssueIds,
    tournamentIds: tournamentRefs.tournamentIds,
    tournamentSectorIds: tournamentRefs.tournamentSectorIds,
    venueId,
  })
  const commerceTables = buildCommerceTables(source, {
    cabinProductIds: commerceRefs.cabinProductIds,
    lakeIds: venueRefs.lakeIds,
    paymentMethodIds: commerceRefs.paymentMethodIds,
    pegIds: venueRefs.pegIds,
    permitProductIds: commerceRefs.permitProductIds,
    rentalItemIds: commerceRefs.rentalItemIds,
    reservationExtraIds: commerceRefs.reservationExtraIds,
    reservationIds: commerceRefs.reservationIds,
    venueId,
  })
  const catchTables = buildCatchTables(source, {
    catchRecordIds: catchRefs.catchRecordIds,
    lakeIds: venueRefs.lakeIds,
    pegIds: venueRefs.pegIds,
    tripLogbookIds: catchRefs.tripLogbookIds,
    venueId,
  })
  const tournamentTables = buildTournamentTables(source, {
    baseDate,
    lakeIds: venueRefs.lakeIds,
    tournamentIds: tournamentRefs.tournamentIds,
    tournamentMarshalIds: tournamentRefs.tournamentMarshalIds,
    tournamentSectorIds: tournamentRefs.tournamentSectorIds,
    tournamentTeamIds: tournamentRefs.tournamentTeamIds,
    venueId,
  })
  const sponsorTables = buildSponsorTables(source, {
    sponsorAssetIds: sponsorRefs.sponsorAssetIds,
    sponsorAssetRefs: sponsorRefs.sponsorAssetRefs,
    sponsorIds: sponsorRefs.sponsorIds,
    tournamentIds: tournamentRefs.tournamentIds,
    venueId,
  })

  // Table key order is pinned to the original single-object layout (not a
  // plain alphabetical sort — e.g. payment_methods/permit_products and
  // sponsor_assets sit out of strict order there too) purely so the
  // generated seed JSON stays byte-for-byte stable across the refactor.
  const mergedTables: Record<string, SeedRow[]> = {
    ...venueTables,
    ...commerceTables,
    ...catchTables,
    ...tournamentTables,
    ...sponsorTables,
  }
  const tableOrder = [
    'alerts',
    'cabin_product_pegs',
    'cabin_products',
    'catch_photos',
    'catch_records',
    'lake_closure_pegs',
    'lake_closures',
    'lakes',
    'map_facilities',
    'map_layers',
    'map_shapes',
    'pegs',
    'place_issues',
    'payment_methods',
    'permit_products',
    'rental_bookings',
    'rental_items',
    'required_equipment_items',
    'reservation_extras',
    'reservation_items',
    'reservations',
    'sponsor_placements',
    'sponsors',
    'sponsor_assets',
    'tournament_catches',
    'tournament_marshal_sectors',
    'tournament_marshals',
    'tournament_organizations',
    'tournament_penalties',
    'tournament_requests',
    'tournament_rule_checks',
    'tournament_sectors',
    'tournament_teams',
    'tournaments',
    'trip_logbook_entries',
    'trip_logbook_members',
    'trip_logbook_pegs',
    'trip_logbooks',
    'venues',
  ]
  const tables: Record<string, SeedRow[]> = Object.fromEntries(
    Object.entries(mergedTables).sort(
      ([tableA], [tableB]) => tableOrder.indexOf(tableA) - tableOrder.indexOf(tableB),
    ),
  )

  const references = {
    cabinProducts: commerceRefs.cabinProductIds,
    catchRecords: catchRefs.catchRecordIds,
    catchPhotos: mapBy(source.catchPhotos, (photo) => photo.id, (photo) => rowId('catch_photos', photo.id)),
    lakes: venueRefs.lakeIds,
    mapFacilities: venueRefs.mapFacilityIds,
    pegs: venueRefs.pegIds,
    placeIssues: venueRefs.placeIssueIds,
    paymentMethods: commerceRefs.paymentMethodIds,
    permitProducts: commerceRefs.permitProductIds,
    rentalItems: commerceRefs.rentalItemIds,
    reservationExtras: commerceRefs.reservationExtraIds,
    reservations: commerceRefs.reservationIds,
    sponsorAssets: sponsorRefs.sponsorAssetIds,
    sponsors: sponsorRefs.sponsorIds,
    tournamentMarshals: tournamentRefs.tournamentMarshalIds,
    tournamentSectors: tournamentRefs.tournamentSectorIds,
    tournamentTeams: tournamentRefs.tournamentTeamIds,
    tournaments: tournamentRefs.tournamentIds,
    tripLogbooks: catchRefs.tripLogbookIds,
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
