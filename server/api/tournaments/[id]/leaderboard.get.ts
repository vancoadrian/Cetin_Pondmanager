import { createError, defineEventHandler, getRouterParam, setHeader } from 'h3'
import { createTournamentLeaderboardFeed } from '~/utils/tournamentLeaderboard'
import { readLocalTournamentState } from '../../../utils/localTournamentStore'

export default defineEventHandler(async (event) => {
  const tournamentId = getRouterParam(event, 'id')
  const state = await readLocalTournamentState()
  const tournament = state.tournaments.find((item) => item.id === tournamentId)

  if (!tournament) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Tournament not found',
    })
  }

  setHeader(event, 'cache-control', 'public, max-age=30')

  return createTournamentLeaderboardFeed(tournament, state.tournamentCatches)
})
