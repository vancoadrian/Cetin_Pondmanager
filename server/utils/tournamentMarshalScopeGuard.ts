import { createError, type H3Event } from 'h3'
import type { TournamentMarshal } from '~/data/pond'
import {
  getTournamentMarshalScopeDecision,
  type TournamentMarshalScopeInput,
} from '~/utils/tournamentMarshalScope'
import { resolveAppSessionUser } from './appSession'

export function requireTournamentMarshalMutationScope(
  event: H3Event,
  marshals: TournamentMarshal[],
  input: TournamentMarshalScopeInput,
) {
  const decision = getTournamentMarshalScopeDecision(
    resolveAppSessionUser(event),
    marshals,
    input,
  )

  if (!decision.allowed) {
    throw createError({
      data: {
        message: decision.reason,
      },
      statusCode: 403,
      statusMessage: 'Tournament marshal scope denied',
    })
  }

  return decision
}
