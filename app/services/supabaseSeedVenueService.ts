import type {
  Alert,
  ContactInfo,
  Lake,
  LakeClosure,
  LakeSlug,
  MapFacility,
  MapLayer,
  MapShape,
  Peg,
  PlaceIssue,
} from '../data/pond'
import {
  CETIN_TIMEZONE,
  CETIN_VENUE_NAME,
  CETIN_VENUE_SLUG,
  mapBy,
  parseOperationalTimestamp,
  rowId,
  snakeValue,
  type SeedRow,
} from './supabaseSeedShared.ts'

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

export interface SupabaseSeedVenueSource {
  alerts: Alert[]
  contactInfo: ContactInfo
  lakeClosures: LakeClosure[]
  lakes: Lake[]
  mapFacilities: MapFacility[]
  mapLayers: MapLayer[]
  mapShapes: MapShape[]
  pegs: Peg[]
  placeIssues: PlaceIssue[]
}

export interface SupabaseSeedVenueReferenceIds {
  lakeIds: Record<LakeSlug, string>
  mapFacilityIds: Record<string, string>
  pegIds: Record<string, string>
  placeIssueIds: Record<string, string>
}

export function buildVenueReferenceIds(
  source: Pick<SupabaseSeedVenueSource, 'lakes' | 'mapFacilities' | 'pegs' | 'placeIssues'>,
): SupabaseSeedVenueReferenceIds {
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

  return { lakeIds, mapFacilityIds, pegIds, placeIssueIds }
}

export interface SupabaseSeedVenueTablesParams {
  baseDate: string
  lakeIds: Record<LakeSlug, string>
  mapFacilityIds: Record<string, string>
  pegIds: Record<string, string>
  placeIssueIds: Record<string, string>
  tournamentIds: Record<string, string>
  tournamentSectorIds: Record<string, string>
  venueId: string
}

export function buildVenueTables(
  source: SupabaseSeedVenueSource,
  params: SupabaseSeedVenueTablesParams,
): Record<string, SeedRow[]> {
  const {
    baseDate,
    lakeIds,
    mapFacilityIds,
    pegIds,
    placeIssueIds,
    tournamentIds,
    tournamentSectorIds,
    venueId,
  } = params

  return {
    alerts: source.alerts.map((alert) => ({
      body: alert.body,
      id: rowId('alerts', alert.id),
      lake_id: null,
      severity: alert.severity,
      title: alert.title,
      valid_from: `${baseDate}T00:00:00+02:00`,
      valid_until: parseOperationalTimestamp(alert.validUntil, baseDate),
      venue_id: venueId,
      visibility: 'public',
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
}
