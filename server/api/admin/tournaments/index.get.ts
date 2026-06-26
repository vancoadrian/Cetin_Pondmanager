import { createError, defineEventHandler } from 'h3'
import type { TournamentStateResponse } from '~/services/tournamentApiService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { resolveAppSessionUser } from '../../../utils/appSession'
import { readLocalTournamentState } from '../../../utils/localTournamentStore'

export default defineEventHandler(async (event): Promise<TournamentStateResponse> => {
  requireAdminAccess(event, { moduleId: 'tournaments' })
  if (resolveAppSessionUser(event)?.role === 'marshal') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Use the scoped marshal tournament endpoint',
    })
  }
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
