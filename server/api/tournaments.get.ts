import { defineEventHandler } from 'h3'
import type { TournamentStateResponse } from '~/services/tournamentApiService'
import { createPublicTournamentStateResponse } from '~/utils/tournamentStateVisibility'
import { readLocalTournamentState } from '../utils/localTournamentStore'

export default defineEventHandler(async (): Promise<TournamentStateResponse> => {
  const state = await readLocalTournamentState()

  return createPublicTournamentStateResponse(state, state.updatedAt)
})
