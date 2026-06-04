import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import {
  cleanupNotificationTestBroadcasts,
  type NotificationTestCleanupSuccess,
} from '~/services/notificationService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import { readLocalNotificationState, writeLocalNotificationState } from '../../../utils/localNotificationStore'

export default defineEventHandler(async (event): Promise<NotificationTestCleanupSuccess> => {
  requireAdminAccess(event, { moduleId: 'notifications', mode: 'operate' })

  const state = await readLocalNotificationState()
  const actor = resolveAuditActor(event)
  const result = cleanupNotificationTestBroadcasts(await readBody(event), state)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Notification test cleanup validation failed',
    })
  }

  await writeLocalNotificationState({
    alerts: result.alerts,
    broadcasts: result.broadcasts,
    deliveryLogs: result.deliveryLogs,
    subscriptions: result.subscriptions,
  })
  await appendLocalAuditEvent({
    ...actor,
    action: 'notification.tests.cleaned',
    area: 'system',
    details: {
      cutoffAt: result.cutoffAt,
      keepRecentTestBroadcasts: result.keepRecentTestBroadcasts,
      olderThanDays: result.olderThanDays,
      removedDeliveryLogCount: result.removedDeliveryLogCount,
      removedTestBroadcastCount: result.removedTestBroadcastCount,
    },
    entityId: 'notification-test-cleanup',
    entityLabel: 'Údržba testovacích notifikácií',
    entityType: 'notification_broadcast',
    severity: 'info',
    summary: `Správca vyčistil ${result.removedTestBroadcastCount} testovacích broadcastov.`,
  })
  setResponseStatus(event, result.statusCode)

  return result
})
