import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { submitTournamentRequest } from '~/services/tournamentApiService'
import { resolveAuditActor } from '../utils/auditActor'
import { appendLocalAuditEvent } from '../utils/localAuditLogStore'
import { appendLocalTournamentRequest, readLocalTournamentState } from '../utils/localTournamentStore'

export default defineEventHandler(async (event) => {
  const state = await readLocalTournamentState()
  const result = submitTournamentRequest(await readBody(event), state)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Tournament request validation failed',
    })
  }

  await appendLocalTournamentRequest(result.request)
  await appendLocalAuditEvent({
    ...resolveAuditActor(event, {
      actorId: 'public-team',
      actorLabel: result.request.team,
      actorRole: 'tournament_team',
    }),
    action: 'tournament.request.created',
    area: 'tournaments',
    details: {
      priority: result.request.priority,
      sectorId: result.request.sectorId,
      status: result.request.status,
      type: result.request.type,
    },
    entityId: result.request.id,
    entityLabel: result.request.team,
    entityType: 'tournament_request',
    severity: result.request.priority === 'high' ? 'warning' : 'info',
    summary: `${result.request.team} poslali hlásenie zo sektora ${result.request.sectorId.toUpperCase()}.`,
    tournamentId: result.request.tournamentId,
  })
  setResponseStatus(event, result.statusCode)

  return result
})
