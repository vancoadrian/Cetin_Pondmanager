import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import {
  createNotificationBroadcast,
  type NotificationBroadcastSuccess,
} from '~/services/notificationService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import { readLocalNotificationState, writeLocalNotificationState } from '../../../utils/localNotificationStore'
import { runServerNotificationDelivery } from '../../../utils/notificationDeliveryRunner'
import { resolveNotificationDeliveryOptions } from '../../../utils/notificationDeliveryProvider'

export default defineEventHandler(async (event): Promise<NotificationBroadcastSuccess> => {
  requireAdminAccess(event, { moduleId: 'notifications', mode: 'operate' })

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
  if (!result.broadcast.expiresAt) {
    throw createError({
      data: { messages: ['Verejný oznam musí mať presný dátum a čas platnosti.'] },
      statusCode: 422,
      statusMessage: 'Notification alert expiry required',
    })
  }

  const deliveryOptions = resolveNotificationDeliveryOptions()
  const deliveryRun = await runServerNotificationDelivery(result.broadcast, state, deliveryOptions)
  const broadcasts = result.broadcasts.map((broadcast) =>
    broadcast.id === deliveryRun.broadcast.id ? deliveryRun.broadcast : broadcast,
  )
  const deliveryLogs = [...deliveryRun.deliveryLogs, ...state.deliveryLogs].slice(0, 500)

  await writeLocalNotificationState({
    alerts: result.alerts,
    broadcasts,
    deliveryLogs,
    subscriptions: result.subscriptions,
  })
  await appendLocalAuditEvent({
    ...actor,
    action: 'notification.broadcast.created',
    area: 'system',
    details: {
      deliveryProvider: deliveryOptions.provider,
      expiresAt: deliveryRun.broadcast.expiresAt ?? null,
      recipientCount: deliveryRun.broadcast.recipientCount,
      severity: deliveryRun.broadcast.severity,
      status: deliveryRun.broadcast.status,
      targetLakeIds: deliveryRun.broadcast.targetLakeIds ?? [],
      targetTopics: deliveryRun.broadcast.targetTopics,
      validUntil: deliveryRun.broadcast.validUntil,
    },
    entityId: deliveryRun.broadcast.id,
    entityLabel: deliveryRun.broadcast.title,
    entityType: 'notification_broadcast',
    severity: deliveryRun.broadcast.severity === 'storm' ? 'critical' : 'info',
    summary: `Správca pripravil notifikáciu ${deliveryRun.broadcast.title}.`,
  })
  setResponseStatus(event, result.statusCode)

  return {
    ...result,
    broadcast: deliveryRun.broadcast,
    broadcasts,
    deliveryLogs,
    message: deliveryRun.broadcast.message,
  }
})
