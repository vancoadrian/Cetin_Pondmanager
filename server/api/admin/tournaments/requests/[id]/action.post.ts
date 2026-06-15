import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { submitTournamentRequestAction } from '~/services/tournamentApiService'
import { requireAdminAccess } from '../../../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../../../utils/localAuditLogStore'
import { readLocalTournamentState, writeLocalTournamentState } from '../../../../../utils/localTournamentStore'
import { tryAppendTournamentNotificationBroadcast } from '../../../../../utils/tournamentNotificationDispatcher'

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
  if (result.request && !result.idempotentReplay) {
    const actor = resolveAuditActor(event, {
      actorId: 'admin',
      actorLabel: 'Admin',
      actorRole: 'manager',
    })

    await appendLocalAuditEvent({
      ...actor,
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
    if (result.request.status === 'assigned') {
      const assignedMarshal = result.tournamentMarshals.find((marshal) => marshal.id === result.request?.assignedMarshalId)
      const notification = await tryAppendTournamentNotificationBroadcast({
        body: `${assignedMarshal?.name ?? 'Kontrolór'} má nové hlásenie: sektor ${result.request.sectorId.toUpperCase()} · ${result.request.team}.`,
        createdBy: actor.actorLabel,
        marshalIds: result.request.assignedMarshalId ? [result.request.assignedMarshalId] : [],
        reason: 'priradené hlásenie',
        requestId: result.request.id,
        roles: ['marshal'],
        sectorIds: [result.request.sectorId],
        title: 'Kontrolór priradený',
        tournamentId: result.request.tournamentId,
      })

      if (notification) {
        await appendLocalAuditEvent({
          actorId: 'system',
          actorLabel: 'Súťažný dispečing',
          actorRole: 'system',
          action: 'notification.tournament.assigned',
          area: 'tournaments',
          details: {
            assignedMarshalId: result.request.assignedMarshalId ?? null,
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
          summary: `Dispečing pripravil notifikáciu pre kontrolóra ${assignedMarshal?.name ?? 'bez mena'}.`,
          tournamentId: result.request.tournamentId,
        })
      }
    }
  }
  setResponseStatus(event, result.statusCode)

  return result
})
