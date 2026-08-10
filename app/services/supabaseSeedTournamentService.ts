import type {
  LakeSlug,
  Tournament,
  TournamentCatch,
  TournamentMarshal,
  TournamentPenalty,
  TournamentRequest,
  TournamentRuleCheck,
} from '../data/pond'
import { mapBy, parseOperationalTimestamp, parseTournamentRange, rowId, snakeValue, type SeedRow } from './supabaseSeedShared.ts'

export interface SupabaseSeedTournamentSource {
  tournamentCatches: TournamentCatch[]
  tournamentMarshals: TournamentMarshal[]
  tournamentPenalties: TournamentPenalty[]
  tournamentRequests: TournamentRequest[]
  tournamentRuleChecks: TournamentRuleCheck[]
  tournaments: Tournament[]
}

export interface SupabaseSeedTournamentReferenceIds {
  tournamentIds: Record<string, string>
  tournamentMarshalIds: Record<string, string>
  tournamentSectorIds: Record<string, string>
  tournamentTeamIds: Record<string, string>
}

export function buildTournamentReferenceIds(
  source: Pick<SupabaseSeedTournamentSource, 'tournamentMarshals' | 'tournaments'>,
): SupabaseSeedTournamentReferenceIds {
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

  return { tournamentIds, tournamentMarshalIds, tournamentSectorIds, tournamentTeamIds }
}

export interface SupabaseSeedTournamentTablesParams {
  baseDate: string
  lakeIds: Record<LakeSlug, string>
  tournamentIds: Record<string, string>
  tournamentMarshalIds: Record<string, string>
  tournamentSectorIds: Record<string, string>
  tournamentTeamIds: Record<string, string>
  venueId: string
}

export function buildTournamentTables(
  source: SupabaseSeedTournamentSource,
  params: SupabaseSeedTournamentTablesParams,
): Record<string, SeedRow[]> {
  const {
    baseDate,
    lakeIds,
    tournamentIds,
    tournamentMarshalIds,
    tournamentSectorIds,
    tournamentTeamIds,
    venueId,
  } = params

  const teamIdFor = (tournamentId: string, sectorId: string, teamName?: string) => {
    const teamId = tournamentTeamIds[`${tournamentId}:${sectorId}`]
    if (teamId) return teamId

    const tournament = source.tournaments.find((item) => item.id === tournamentId)
    const matchingSector = tournament?.sectors.find((sector) => sector.team === teamName)

    return matchingSector ? tournamentTeamIds[`${tournamentId}:${matchingSector.id}`] ?? null : null
  }

  return {
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
  }
}
