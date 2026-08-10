import type {
  CatchPhoto,
  CatchRecord,
  LakeSlug,
  TripLogbook,
  TripLogbookEntry,
} from '../data/pond'
import { dateOnly, mapBy, rowId, snakeValue, type SeedRow } from './supabaseSeedShared.ts'

export interface SupabaseSeedCatchSource {
  catchPhotos: CatchPhoto[]
  catches: CatchRecord[]
  tripLogbookEntries: TripLogbookEntry[]
  tripLogbooks: TripLogbook[]
}

export interface SupabaseSeedCatchReferenceIds {
  catchRecordIds: Record<string, string>
  tripLogbookIds: Record<string, string>
}

export function buildCatchReferenceIds(
  source: Pick<SupabaseSeedCatchSource, 'catches' | 'tripLogbooks'>,
): SupabaseSeedCatchReferenceIds {
  const catchRecordIds = mapBy(source.catches, (catchItem) => catchItem.id, (catchItem) => rowId('catch_records', catchItem.id))
  const tripLogbookIds = mapBy(
    source.tripLogbooks,
    (logbook) => logbook.id,
    (logbook) => rowId('trip_logbooks', logbook.id),
  )

  return { catchRecordIds, tripLogbookIds }
}

export interface SupabaseSeedCatchTablesParams {
  catchRecordIds: Record<string, string>
  lakeIds: Record<LakeSlug, string>
  pegIds: Record<string, string>
  tripLogbookIds: Record<string, string>
  venueId: string
}

export function buildCatchTables(
  source: SupabaseSeedCatchSource,
  params: SupabaseSeedCatchTablesParams,
): Record<string, SeedRow[]> {
  const { catchRecordIds, lakeIds, pegIds, tripLogbookIds, venueId } = params

  return {
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
  }
}
