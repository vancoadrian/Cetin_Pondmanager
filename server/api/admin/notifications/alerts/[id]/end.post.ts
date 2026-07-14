import { createError, defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import {
  endNotificationAlert,
  type NotificationAlertEndSuccess,
} from '~/services/notificationService'
import { requireAdminAccess } from '../../../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../../../utils/localAuditLogStore'
import { readLocalNotificationState, writeLocalNotificationState } from '../../../../../utils/localNotificationStore'

export default defineEventHandler(async (event): Promise<NotificationAlertEndSuccess> => {
  requireAdminAccess(event, { moduleId: 'notifications', mode: 'operate' })

  const alertId = getRouterParam(event, 'id') ?? ''
  const state = await readLocalNotificationState()
  const actor = resolveAuditActor(event)
  const result = endNotificationAlert({ alertId }, state, actor.actorLabel)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Notification alert end failed',
    })
  }

  await writeLocalNotificationState({
    alerts: result.alerts,
    broadcasts: result.broadcasts,
    deliveryLogs: state.deliveryLogs,
    subscriptions: state.subscriptions,
  })
  await appendLocalAuditEvent({
    ...actor,
    action: 'notification.alert.ended',
    area: 'system',
    details: {
      broadcastId: result.broadcast?.id ?? null,
      endedAt: result.alert.endedAt ?? null,
      expiresAt: result.alert.expiresAt ?? null,
      lakeIds: result.alert.lakeIds ?? [],
    },
    entityId: result.alert.id,
    entityLabel: result.alert.title,
    entityType: 'notification_alert',
    severity: 'info',
    summary: `Správca ukončil verejný oznam ${result.alert.title}.`,
  })
  setResponseStatus(event, result.statusCode)

  return result
})
