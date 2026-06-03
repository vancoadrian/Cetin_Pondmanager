import { defineEventHandler } from 'h3'
import type { TournamentStateResponse } from '~/services/tournamentApiService'
import { readLocalTournamentState } from '../utils/localTournamentStore'

export default defineEventHandler(async (): Promise<TournamentStateResponse> => {
  const state = await readLocalTournamentState()

  return {
    ok: true,
    tournamentCatches: state.tournamentCatches,
    tournamentMarshals: state.tournamentMarshals,
    tournamentPenalties: state.tournamentPenalties,
    tournamentRequests: state.tournamentRequests,
    tournamentRuleChecks: state.tournamentRuleChecks,
    tournamentTeamRegistrations: state.tournamentTeamRegistrations,
    tournaments: state.tournaments,
    updatedAt: state.updatedAt,
  }
})
