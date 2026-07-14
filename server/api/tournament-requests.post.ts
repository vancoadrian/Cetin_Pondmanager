import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { canUseTournamentTeamScope } from '~/composables/useMockAuth'
import { submitTournamentRequest } from '~/services/tournamentApiService'
import { tournamentRequestTypeLabels } from '~/data/pond'
import { resolveAuditActor } from '../utils/auditActor'
import { appendLocalAuditEvent } from '../utils/localAuditLogStore'
import { appendLocalTournamentRequest, readLocalTournamentState } from '../utils/localTournamentStore'
import { tryAppendTournamentNotificationBroadcast } from '../utils/tournamentNotificationDispatcher'
import { resolveAppSessionUser } from '../utils/appSession'

function notificationBody(value: string) {
  return value.length > 280 ? `${value.slice(0, 277)}...` : value
}

function marshalIdsForSector(state: Awaited<ReturnType<typeof readLocalTournamentState>>, sectorId: string) {
  return state.tournamentMarshals
    .filter((marshal) => marshal.assignedSectorIds.includes(sectorId))
    .map((marshal) => marshal.id)
}

export default defineEventHandler(async (event) => {
  const payload = await readBody(event)
  const sessionUser = resolveAppSessionUser(event)
  if (!canUseTournamentTeamScope(sessionUser, payload?.tournamentId, payload?.sectorId)) {
    throw createError({
      statusCode: sessionUser ? 403 : 401,
      statusMessage: sessionUser ? 'Tournament team scope denied' : 'Tournament team login required',
    })
  }

  const state = await readLocalTournamentState()
  const result = submitTournamentRequest(payload, state)

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
  const notification = await tryAppendTournamentNotificationBroadcast({
    body: notificationBody(`${result.request.team} · sektor ${result.request.sectorId.toUpperCase()}: ${tournamentRequestTypeLabels[result.request.type]}. ${result.request.description}`),
    createdBy: 'Súťažný dispečing',
    lake: state.tournaments.find((tournament) => tournament.id === result.request.tournamentId)?.lake,
    marshalIds: marshalIdsForSector(state, result.request.sectorId),
    reason: result.request.type === 'catch-measurement'
      ? 'privolanie kontrolóra'
      : 'súťažné hlásenie tímu',
    requestId: result.request.id,
    roles: ['tournament_organizer', 'marshal'],
    sectorIds: [result.request.sectorId],
    title: result.request.type === 'catch-measurement'
      ? 'Tím žiada kontrolóra'
      : 'Nové súťažné hlásenie',
    tournamentId: result.request.tournamentId,
  })
  if (notification) {
    await appendLocalAuditEvent({
      actorId: 'system',
      actorLabel: 'Súťažný dispečing',
      actorRole: 'system',
      action: 'notification.tournament.created',
      area: 'tournaments',
      details: {
        broadcastId: notification.broadcast.id,
        recipientCount: notification.broadcast.recipientCount,
        requestId: result.request.id,
        targetAudience: notification.broadcast.targetAudience
          ? JSON.stringify(notification.broadcast.targetAudience)
          : null,
        targetTopics: notification.broadcast.targetTopics,
      },
      entityId: notification.broadcast.id,
      entityLabel: notification.broadcast.title,
      entityType: 'notification_broadcast',
      severity: 'info',
      summary: `Dispečing pripravil notifikáciu pre hlásenie tímu ${result.request.team}.`,
      tournamentId: result.request.tournamentId,
    })
  }
  setResponseStatus(event, result.statusCode)

  return result
})
