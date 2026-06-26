import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { createMockPondRepository, createPondSnapshot } from '~/repositories/pondRepository'
import { submitPlaceIssue } from '~/services/placeIssueService'
import { createPondService } from '~/services/pondService'
import { resolveAuditActor } from '../utils/auditActor'
import { appendLocalAuditEvent } from '../utils/localAuditLogStore'
import { appendLocalPlaceIssue, readLocalPlaceIssueState } from '../utils/localPlaceIssueStore'
import { readLocalMapState } from '../utils/localMapStore'
import { tryAppendPlaceIssueNotificationBroadcast } from '../utils/placeIssueNotificationDispatcher'

export default defineEventHandler(async (event) => {
  const [issueState, mapState] = await Promise.all([
    readLocalPlaceIssueState(),
    readLocalMapState(),
  ])
  const service = createPondService(
    createMockPondRepository(
      createPondSnapshot({
        mapFacilities: mapState.mapFacilities,
        pegs: mapState.pegs,
      }),
    ),
  )
  const result = submitPlaceIssue(await readBody(event), issueState, service)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Place issue validation failed',
    })
  }

  await appendLocalPlaceIssue(result.issue)
  await appendLocalAuditEvent({
    ...resolveAuditActor(event, {
      actorId: 'public',
      actorLabel: result.issue.reporterName ?? 'Verejný formulár',
      actorRole: 'angler',
    }),
    action: 'place_issue.created',
    area: 'issues',
    details: {
      category: result.issue.category,
      priority: result.issue.priority,
      reporterPhone: result.issue.reporterPhone ?? null,
      status: result.issue.status,
      targetId: result.issue.targetId ?? null,
      targetType: result.issue.targetType,
    },
    entityId: result.issue.id,
    entityLabel: result.issue.title,
    entityType: 'place_issue',
    lake: result.issue.lake,
    severity: result.issue.priority === 'urgent' ? 'warning' : 'info',
    summary: `Nové hlásenie nedostatku: ${result.issue.title}.`,
  })
  const notification = await tryAppendPlaceIssueNotificationBroadcast({
    createdBy: 'Prevádzkové hlásenia',
    issue: result.issue,
  })
  if (notification) {
    await appendLocalAuditEvent({
      actorId: 'system',
      actorLabel: 'Prevádzkové hlásenia',
      actorRole: 'system',
      action: 'notification.place_issue.created',
      area: 'issues',
      details: {
        broadcastId: notification.broadcast.id,
        issueId: result.issue.id,
        recipientCount: notification.broadcast.recipientCount,
        targetAudience: notification.broadcast.targetAudience
          ? JSON.stringify(notification.broadcast.targetAudience)
          : null,
        targetTopics: notification.broadcast.targetTopics,
      },
      entityId: notification.broadcast.id,
      entityLabel: notification.broadcast.title,
      entityType: 'notification_broadcast',
      lake: result.issue.lake,
      severity: result.issue.priority === 'urgent' ? 'warning' : 'info',
      summary: `Systém pripravil prevádzkovú notifikáciu pre hlásenie ${result.issue.title}.`,
    })
  }
  setResponseStatus(event, result.statusCode)

  return {
    issue: result.issue,
    message: result.message,
    ok: result.ok,
    statusCode: result.statusCode,
  }
})
