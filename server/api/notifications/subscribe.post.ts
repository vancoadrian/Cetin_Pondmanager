import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import {
  savePushSubscription,
  type PushSubscriptionMutationSuccess,
} from '~/services/notificationService'
import { readLocalNotificationState, writeLocalNotificationState } from '../../utils/localNotificationStore'

export default defineEventHandler(async (event): Promise<PushSubscriptionMutationSuccess> => {
  const state = await readLocalNotificationState()
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
    subscriptions: result.subscriptions,
  })
  setResponseStatus(event, result.statusCode)

  return result
})
