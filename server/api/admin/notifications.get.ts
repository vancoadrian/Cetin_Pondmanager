import { defineEventHandler } from 'h3'
import type { NotificationStateResponse } from '~/services/notificationService'
import { readLocalNotificationState } from '../../utils/localNotificationStore'

export default defineEventHandler(async (): Promise<NotificationStateResponse> => {
  const state = await readLocalNotificationState()

  return {
    alerts: state.alerts,
    broadcasts: state.broadcasts,
    ok: true,
    subscriptionCount: state.subscriptions.filter((subscription) => subscription.enabled).length,
    subscriptions: state.subscriptions,
    updatedAt: state.updatedAt,
  }
})
