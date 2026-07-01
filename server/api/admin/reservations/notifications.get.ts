import { defineEventHandler } from 'h3'
import type { NotificationDeliveryStatus } from '~/data/pond'
import type {
  ReservationNotificationSummary,
  ReservationNotificationSummaryResponse,
} from '~/services/reservationApiService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { readLocalNotificationState } from '../../../utils/localNotificationStore'

const deliveryStatuses: NotificationDeliveryStatus[] = ['sent', 'prepared', 'failed', 'skipped']

function createEmptyDeliveryCounts(): Record<NotificationDeliveryStatus, number> {
  return {
    failed: 0,
    prepared: 0,
    sent: 0,
    skipped: 0,
  }
}

export default defineEventHandler(async (event): Promise<ReservationNotificationSummaryResponse> => {
  requireAdminAccess(event, { moduleId: 'reservations' })

  const state = await readLocalNotificationState()
  const notifications: ReservationNotificationSummary[] = state.broadcasts
    .filter((broadcast) =>
      broadcast.targetTopics.includes('reservations') &&
      Boolean(broadcast.targetAudience?.requestId),
    )
    .map((broadcast) => {
      const deliveryLogs = state.deliveryLogs.filter((log) => log.broadcastId === broadcast.id)
      const deliveryCounts = deliveryLogs.reduce((counts, log) => {
        counts[log.status] += 1

        return counts
      }, createEmptyDeliveryCounts())
      const latestDeliveryAt = deliveryLogs
        .map((log) => log.attemptedAt)
        .sort((first, second) => second.localeCompare(first))[0]

      return {
        body: broadcast.body,
        broadcastId: broadcast.id,
        createdAt: broadcast.createdAt,
        createdBy: broadcast.createdBy,
        deliveryCounts,
        latestDeliveryAt,
        message: broadcast.message,
        recipientCount: broadcast.recipientCount,
        reservationId: broadcast.targetAudience?.requestId ?? '',
        status: broadcast.status,
        title: broadcast.title,
      }
    })
    .filter((notification) => notification.reservationId)
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))

  for (const notification of notifications) {
    for (const status of deliveryStatuses) {
      notification.deliveryCounts[status] ??= 0
    }
  }

  return {
    notifications,
    ok: true,
    updatedAt: state.updatedAt,
  }
})
