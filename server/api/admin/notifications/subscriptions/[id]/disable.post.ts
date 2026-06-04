import { createError, defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import {
  disablePushSubscriptionById,
  type PushSubscriptionMutationSuccess,
} from '~/services/notificationService'
import { requireAdminAccess } from '../../../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../../../utils/localAuditLogStore'
import { readLocalNotificationState, writeLocalNotificationState } from '../../../../../utils/localNotificationStore'

export default defineEventHandler(async (event): Promise<PushSubscriptionMutationSuccess> => {
  requireAdminAccess(event, { moduleId: 'notifications', mode: 'operate' })

  const subscriptionId = getRouterParam(event, 'id') ?? ''
  const state = await readLocalNotificationState()
  const actor = resolveAuditActor(event)
  const result = disablePushSubscriptionById({ subscriptionId }, state)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Push subscription disable failed',
    })
  }

  await writeLocalNotificationState({
    alerts: state.alerts,
    broadcasts: state.broadcasts,
    deliveryLogs: state.deliveryLogs,
    subscriptions: result.subscriptions,
  })
  await appendLocalAuditEvent({
    ...actor,
    action: 'notification.subscription.disabled',
    area: 'system',
    details: {
      audienceRole: result.subscription.audienceRole ?? null,
      endpoint: result.subscription.endpoint,
      topics: result.subscription.topics,
    },
    entityId: result.subscription.id,
    entityLabel: result.subscription.deviceLabel,
    entityType: 'push_subscription',
    severity: 'info',
    summary: `Správca vypol odber ${result.subscription.deviceLabel}.`,
  })
  setResponseStatus(event, result.statusCode)

  return result
})
