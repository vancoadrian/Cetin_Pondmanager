import { createError, defineEventHandler } from 'h3'
import type { TournamentStateResponse } from '~/services/tournamentApiService'
import { createTournamentAccountStateResponse } from '~/utils/tournamentStateVisibility'
import { resolveAppSessionUser } from '../../utils/appSession'
import { readLocalTournamentState } from '../../utils/localTournamentStore'

export default defineEventHandler(async (event): Promise<TournamentStateResponse> => {
  const user = resolveAppSessionUser(event)
  if (user?.role !== 'team' && user?.role !== 'marshal') {
    throw createError({
      statusCode: user ? 403 : 401,
      statusMessage: user ? 'Tournament account access denied' : 'Login required',
    })
  }

  const state = await readLocalTournamentState()
  const response = createTournamentAccountStateResponse(state, user, state.updatedAt)
  if (!response) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Tournament account scope is not configured',
    })
  }

  return response
})
