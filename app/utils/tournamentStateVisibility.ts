import type { MockUser } from '~/composables/useMockAuth'
import type { TournamentWorkflowState, TournamentStateResponse } from '~/services/tournamentApiService'

function cloneTournamentState(state: TournamentWorkflowState): TournamentWorkflowState {
  return {
    tournamentCatches: state.tournamentCatches.map((catchItem) => ({ ...catchItem })),
    tournamentMarshals: state.tournamentMarshals.map((marshal) => ({
      ...marshal,
      assignedSectorIds: [...marshal.assignedSectorIds],
    })),
    tournamentPenalties: state.tournamentPenalties.map((penalty) => ({ ...penalty })),
    tournamentRequests: state.tournamentRequests.map((request) => ({ ...request })),
    tournamentRuleChecks: state.tournamentRuleChecks.map((check) => ({ ...check })),
    tournamentTeamRegistrations: state.tournamentTeamRegistrations.map((registration) => ({ ...registration })),
    tournaments: state.tournaments.map((tournament) => ({
      ...tournament,
      sectors: tournament.sectors.map((sector) => ({ ...sector })),
    })),
  }
}

function withResponseMetadata(
  state: TournamentWorkflowState,
  updatedAt: string,
): TournamentStateResponse {
  return {
    ...state,
    ok: true,
    updatedAt,
  }
}

export function createPublicTournamentStateResponse(
  state: TournamentWorkflowState,
  updatedAt: string,
): TournamentStateResponse {
  const cloned = cloneTournamentState(state)
  const publicCatches = cloned.tournamentCatches
    .filter((catchItem) => catchItem.status === 'verified')
    .map((catchItem) => ({
      ...catchItem,
      notes: '',
      photoLabel: '',
      verificationClientMutationId: undefined,
      verifiedByMarshalId: '',
    }))

  return withResponseMetadata({
    tournamentCatches: publicCatches,
    tournamentMarshals: [],
    tournamentPenalties: [],
    tournamentRequests: [],
    tournamentRuleChecks: [],
    tournamentTeamRegistrations: [],
    tournaments: cloned.tournaments.map((tournament) => ({
      ...tournament,
      sectors: tournament.sectors.map((sector) => ({
        ...sector,
        weightKg: publicCatches
          .filter((catchItem) =>
            catchItem.tournamentId === tournament.id && catchItem.sectorId === sector.id,
          )
          .reduce((sum, catchItem) => sum + catchItem.weightKg, 0),
      })),
    })),
  }, updatedAt)
}

export function createTournamentAccountStateResponse(
  state: TournamentWorkflowState,
  user: MockUser | null | undefined,
  updatedAt: string,
): TournamentStateResponse | undefined {
  if (user?.role !== 'team' && user?.role !== 'marshal') return undefined
  if (!user.tournamentId) return undefined

  const tournament = state.tournaments.find((item) => item.id === user.tournamentId)
  if (!tournament) return undefined

  if (user.role === 'team') {
    if (!user.sectorId || !tournament.sectors.some((sector) => sector.id === user.sectorId)) {
      return undefined
    }

    const sectorIds = new Set([user.sectorId])

    return withResponseMetadata({
      tournamentCatches: state.tournamentCatches
        .filter((catchItem) => catchItem.tournamentId === tournament.id && sectorIds.has(catchItem.sectorId))
        .map((catchItem) => ({ ...catchItem })),
      tournamentMarshals: state.tournamentMarshals
        .filter((marshal) => marshal.assignedSectorIds.some((sectorId) => sectorIds.has(sectorId)))
        .map((marshal) => ({
          ...marshal,
          assignedSectorIds: marshal.assignedSectorIds.filter((sectorId) => sectorIds.has(sectorId)),
        })),
      tournamentPenalties: state.tournamentPenalties
        .filter((penalty) => penalty.tournamentId === tournament.id && sectorIds.has(penalty.sectorId))
        .map((penalty) => ({ ...penalty })),
      tournamentRequests: state.tournamentRequests
        .filter((request) => request.tournamentId === tournament.id && sectorIds.has(request.sectorId))
        .map((request) => ({ ...request })),
      tournamentRuleChecks: [],
      tournamentTeamRegistrations: [],
      tournaments: [{
        ...tournament,
        sectors: tournament.sectors
          .filter((sector) => sectorIds.has(sector.id))
          .map((sector) => ({ ...sector })),
      }],
    }, updatedAt)
  }

  if (!user.marshalId) return undefined

  const marshal = state.tournamentMarshals.find((item) => item.id === user.marshalId)
  if (!marshal) return undefined

  const sectorIds = new Set(
    marshal.assignedSectorIds.filter((sectorId) =>
      tournament.sectors.some((sector) => sector.id === sectorId),
    ),
  )

  return withResponseMetadata({
    tournamentCatches: state.tournamentCatches
      .filter((catchItem) => catchItem.tournamentId === tournament.id && sectorIds.has(catchItem.sectorId))
      .map((catchItem) => ({ ...catchItem })),
    tournamentMarshals: [{
      ...marshal,
      assignedSectorIds: [...sectorIds],
    }],
    tournamentPenalties: state.tournamentPenalties
      .filter((penalty) => penalty.tournamentId === tournament.id && sectorIds.has(penalty.sectorId))
      .map((penalty) => ({ ...penalty })),
    tournamentRequests: state.tournamentRequests
      .filter((request) => request.tournamentId === tournament.id && sectorIds.has(request.sectorId))
      .map((request) => ({ ...request })),
    tournamentRuleChecks: state.tournamentRuleChecks
      .filter((check) => check.tournamentId === tournament.id && sectorIds.has(check.sectorId))
      .map((check) => ({ ...check })),
    tournamentTeamRegistrations: [],
    tournaments: [{
      ...tournament,
      sectors: tournament.sectors
        .filter((sector) => sectorIds.has(sector.id))
        .map((sector) => ({ ...sector })),
    }],
  }, updatedAt)
}
