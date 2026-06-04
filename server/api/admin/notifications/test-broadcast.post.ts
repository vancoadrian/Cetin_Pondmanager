import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import {
  createNotificationTestBroadcast,
  type NotificationTestBroadcastSuccess,
} from '~/services/notificationService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import { readLocalNotificationState, writeLocalNotificationState } from '../../../utils/localNotificationStore'
import { runServerNotificationDelivery } from '../../../utils/notificationDeliveryRunner'
import { resolveNotificationDeliveryOptions } from '../../../utils/notificationDeliveryProvider'

export default defineEventHandler(async (event): Promise<NotificationTestBroadcastSuccess> => {
  requireAdminAccess(event, { moduleId: 'notifications', mode: 'operate' })

  const state = await readLocalNotificationState()
  const actor = resolveAuditActor(event)
  const result = createNotificationTestBroadcast(await readBody(event), state, actor.actorLabel)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Notification test broadcast validation failed',
    })
  }

  const deliveryOptions = resolveNotificationDeliveryOptions()
  const deliveryRun = await runServerNotificationDelivery(result.broadcast, state, deliveryOptions)
  const broadcasts = result.broadcasts.map((broadcast) =>
    broadcast.id === deliveryRun.broadcast.id ? deliveryRun.broadcast : broadcast,
  )
  const deliveryLogs = [...deliveryRun.deliveryLogs, ...state.deliveryLogs].slice(0, 500)

  await writeLocalNotificationState({
    alerts: state.alerts,
    broadcasts,
    deliveryLogs,
    subscriptions: result.subscriptions,
  })
  await appendLocalAuditEvent({
    ...actor,
    action: 'notification.broadcast.tested',
    area: 'system',
    details: {
      deliveryProvider: deliveryOptions.provider,
      recipientCount: deliveryRun.broadcast.recipientCount,
      status: deliveryRun.broadcast.status,
      targetTopics: deliveryRun.broadcast.targetTopics,
    },
    entityId: deliveryRun.broadcast.id,
    entityLabel: deliveryRun.broadcast.title,
    entityType: 'notification_broadcast',
    severity: 'info',
    summary: `Správca spustil test notifikácie ${deliveryRun.broadcast.title}.`,
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
