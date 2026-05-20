import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import {
  createNotificationBroadcast,
  type NotificationBroadcastSuccess,
} from '~/services/notificationService'
import { resolveAuditActor } from '../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import { readLocalNotificationState, writeLocalNotificationState } from '../../../utils/localNotificationStore'

export default defineEventHandler(async (event): Promise<NotificationBroadcastSuccess> => {
  const state = await readLocalNotificationState()
  const actor = resolveAuditActor(event)
  const result = createNotificationBroadcast(await readBody(event), state, actor.actorLabel)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Notification broadcast validation failed',
    })
  }

  await writeLocalNotificationState({
    alerts: result.alerts,
    broadcasts: result.broadcasts,
    subscriptions: result.subscriptions,
  })
  await appendLocalAuditEvent({
    ...actor,
    action: 'notification.broadcast.created',
    area: 'system',
    details: {
      recipientCount: result.broadcast.recipientCount,
      severity: result.broadcast.severity,
      status: result.broadcast.status,
      targetTopics: result.broadcast.targetTopics,
      validUntil: result.broadcast.validUntil,
    },
    entityId: result.broadcast.id,
    entityLabel: result.broadcast.title,
    entityType: 'notification_broadcast',
    severity: result.broadcast.severity === 'storm' ? 'critical' : 'info',
    summary: `Správca pripravil notifikáciu ${result.broadcast.title}.`,
  })
  setResponseStatus(event, result.statusCode)

  return result
})
