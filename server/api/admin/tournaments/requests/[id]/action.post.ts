import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { submitTournamentRequestAction } from '~/services/tournamentApiService'
import { requireAdminAccess } from '../../../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../../../utils/localAuditLogStore'
import { readLocalTournamentState, writeLocalTournamentState } from '../../../../../utils/localTournamentStore'

export default defineEventHandler(async (event) => {
  requireAdminAccess(event, { moduleId: 'tournaments', mode: 'operate' })

  const requestId = getRouterParam(event, 'id')
  const state = await readLocalTournamentState()
  const body = await readBody(event)
  const result = submitTournamentRequestAction(
    {
      ...body,
      requestId,
    },
    state,
  )

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Tournament request action validation failed',
    })
  }

  await writeLocalTournamentState(result)
  if (result.request) {
    await appendLocalAuditEvent({
      ...resolveAuditActor(event, {
        actorId: 'admin',
        actorLabel: 'Admin',
        actorRole: 'manager',
      }),
      action: result.request.status === 'resolved'
        ? 'tournament.request.resolved'
        : 'tournament.request.assigned',
      area: 'tournaments',
      details: {
        assignedMarshalId: result.request.assignedMarshalId ?? null,
        sectorId: result.request.sectorId,
        status: result.request.status,
        type: result.request.type,
      },
      entityId: result.request.id,
      entityLabel: result.request.team,
      entityType: 'tournament_request',
      severity: result.request.status === 'resolved' ? 'info' : 'warning',
      summary: result.message,
      tournamentId: result.request.tournamentId,
    })
  }
  setResponseStatus(event, result.statusCode)

  return result
})
