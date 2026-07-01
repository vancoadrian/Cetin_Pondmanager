import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import {
  savePushSubscription,
  type PushSubscriptionMutationSuccess,
} from '~/services/notificationService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import { readLocalNotificationState, writeLocalNotificationState } from '../../../utils/localNotificationStore'

export default defineEventHandler(async (event): Promise<PushSubscriptionMutationSuccess> => {
  requireAdminAccess(event, { moduleId: 'notifications', mode: 'operate' })

  const state = await readLocalNotificationState()
  const actor = resolveAuditActor(event)
  const result = savePushSubscription(await readBody(event), state)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Push subscription validation failed',
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
    action: 'notification.subscription.mock_saved',
    area: 'system',
    details: {
      audienceRole: result.subscription.audienceRole ?? null,
      endpoint: result.subscription.endpoint,
      marshalId: result.subscription.marshalId ?? null,
      sectorIds: result.subscription.sectorIds ?? [],
      topics: result.subscription.topics,
      tournamentIds: result.subscription.tournamentIds ?? [],
    },
    entityId: result.subscription.id,
    entityLabel: result.subscription.deviceLabel,
    entityType: 'push_subscription',
    severity: 'info',
    summary: `Správca uložil interný odber ${result.subscription.deviceLabel}.`,
  })
  setResponseStatus(event, result.statusCode)

  return result
})
