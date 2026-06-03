import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import {
  disablePushSubscription,
  type PushUnsubscribeSuccess,
} from '~/services/notificationService'
import { readLocalNotificationState, writeLocalNotificationState } from '../../utils/localNotificationStore'

export default defineEventHandler(async (event): Promise<PushUnsubscribeSuccess> => {
  const state = await readLocalNotificationState()
  const result = disablePushSubscription(await readBody(event), state)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Push unsubscribe validation failed',
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
