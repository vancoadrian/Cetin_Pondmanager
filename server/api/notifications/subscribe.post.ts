import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import {
  savePushSubscription,
  stripPushSubscriptionAudienceScope,
  type PushSubscriptionMutationSuccess,
} from '~/services/notificationService'
import { readLocalNotificationState, writeLocalNotificationState } from '../../utils/localNotificationStore'

export default defineEventHandler(async (event): Promise<PushSubscriptionMutationSuccess> => {
  const state = await readLocalNotificationState()
  const body = await readBody(event)
  const result = savePushSubscription(stripPushSubscriptionAudienceScope(body), state)

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
  setResponseStatus(event, result.statusCode)

  return result
})
