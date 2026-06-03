import { defineEventHandler } from 'h3'
import type { NotificationStateResponse } from '~/services/notificationService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import { readLocalNotificationState } from '../../utils/localNotificationStore'
import { createNotificationDeliveryDiagnostics } from '../../utils/notificationDeliveryProvider'

export default defineEventHandler(async (event): Promise<NotificationStateResponse> => {
  requireAdminAccess(event, { moduleId: 'notifications' })

  const state = await readLocalNotificationState()

  return {
    alerts: state.alerts,
    broadcasts: state.broadcasts,
    deliveryDiagnostics: createNotificationDeliveryDiagnostics(),
    deliveryLogs: state.deliveryLogs,
    ok: true,
    subscriptionCount: state.subscriptions.filter((subscription) => subscription.enabled).length,
    subscriptions: state.subscriptions,
    updatedAt: state.updatedAt,
  }
})
