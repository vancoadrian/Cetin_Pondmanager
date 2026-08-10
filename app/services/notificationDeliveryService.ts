import type {
  NotificationBroadcast,
  NotificationDeliveryLog,
  NotificationDeliveryProvider,
  PushSubscriptionRecord,
} from '~/data/pond'
import { uniqueId, type NotificationState } from '~/services/notificationService'
import {
  getBroadcastTargetSubscriptions,
  isInternalNotificationBroadcast,
  slugify,
} from '~/services/notificationBroadcastService'

export type NotificationDeliveryUrgency = 'high' | 'low' | 'normal' | 'very-low'

export interface NotificationDeliveryDiagnostics {
  hasVapidConfig: boolean
  missingConfigKeys: string[]
  provider: NotificationDeliveryProvider
  subject?: string
  timeoutMs: number
  ttlSeconds: number
  urgency: NotificationDeliveryUrgency
  webPushReady: boolean
}

export interface NotificationStateResponse extends NotificationState {
  deliveryDiagnostics: NotificationDeliveryDiagnostics
  ok: true
  subscriptionCount: number
  updatedAt: string
}

export interface NotificationDeliveryRunOptions {
  hasVapidConfig?: boolean
  now?: string
  provider: NotificationDeliveryProvider
}

export interface NotificationDeliveryRunResult {
  broadcast: NotificationBroadcast
  deliveryLogs: NotificationDeliveryLog[]
}

function createDeliveryLogId(
  broadcast: NotificationBroadcast,
  subscription: PushSubscriptionRecord,
  state: NotificationState,
) {
  const baseId = `delivery-${slugify(broadcast.id).slice(0, 48)}-${slugify(subscription.id).slice(0, 32)}`

  return uniqueId(baseId, new Set(state.deliveryLogs.map((item) => item.id)))
}

function createDeliveryLogMessage(
  provider: NotificationDeliveryProvider,
  hasVapidConfig: boolean,
  subscription: PushSubscriptionRecord,
) {
  if (provider === 'disabled') {
    return {
      message: 'Push provider je vypnutý, doručenie bolo iba zaevidované.',
      status: 'skipped' as const,
    }
  }

  if (provider === 'mock') {
    return {
      message: 'Skúšobné doručovanie označilo notifikáciu ako doručenú.',
      status: 'sent' as const,
    }
  }

  if (!hasVapidConfig) {
    return {
      message: 'Web Push provider nemá kompletné VAPID nastavenie.',
      status: 'failed' as const,
    }
  }

  if (subscription.endpoint.startsWith('mock://')) {
    return {
      message: 'Skúšobný odber čaká na reálny Web Push endpoint zariadenia.',
      status: 'prepared' as const,
    }
  }

  return {
    message: 'Web Push provider je nakonfigurovaný, serverový adaptér môže odoslať reálny endpoint.',
    status: 'prepared' as const,
  }
}

export function summarizeNotificationDeliveryLogs(
  logs: NotificationDeliveryLog[],
  recipientCount: number,
  emptyMessage = 'Notifikácia je uložená ako verejný oznam, zatiaľ nie je aktívny žiadny odber.',
) {
  const sentCount = logs.filter((log) => log.status === 'sent').length
  const failedCount = logs.filter((log) => log.status === 'failed').length
  const preparedCount = logs.filter((log) => log.status === 'prepared').length
  const skippedCount = logs.filter((log) => log.status === 'skipped').length

  if (recipientCount === 0) {
    return {
      message: emptyMessage,
      status: 'skipped' as const,
    }
  }

  if (sentCount === recipientCount) {
    const allWebPush = logs.every((log) => log.provider === 'web-push')

    return {
      message: allWebPush
        ? `Web Push odoslaný pre ${sentCount} odberov.`
        : `Skúšobné doručovanie zaevidovalo ${sentCount} doručení.`,
      status: 'sent' as const,
    }
  }

  if (failedCount === recipientCount) {
    return {
      message: `Doručenie zlyhalo pre ${failedCount} odberov.`,
      status: 'failed' as const,
    }
  }

  if (skippedCount === recipientCount) {
    return {
      message: `Doručovanie je vypnuté, ${skippedCount} odberov bolo preskočených.`,
      status: 'skipped' as const,
    }
  }

  return {
    message: `Doručenie pripravené: ${sentCount} odoslaných, ${preparedCount} čaká, ${failedCount} zlyhalo, ${skippedCount} preskočených.`,
    status: 'prepared' as const,
  }
}

export function runNotificationDelivery(
  broadcast: NotificationBroadcast,
  state: NotificationState,
  options: NotificationDeliveryRunOptions,
): NotificationDeliveryRunResult {
  const now = options.now ?? new Date().toISOString()
  const recipients = getBroadcastTargetSubscriptions(
    state.subscriptions,
    broadcast.targetTopics,
    broadcast.targetAudience,
    broadcast.targetLakeIds,
  )
  const deliveryLogs = recipients.map((subscription) => {
    const delivery = createDeliveryLogMessage(
      options.provider,
      Boolean(options.hasVapidConfig),
      subscription,
    )

    return {
      attemptedAt: now,
      broadcastId: broadcast.id,
      deviceLabel: subscription.deviceLabel,
      endpoint: subscription.endpoint,
      id: createDeliveryLogId(broadcast, subscription, state),
      message: delivery.message,
      provider: options.provider,
      status: delivery.status,
      subscriptionId: subscription.id,
    }
  })
  const emptyMessage = isInternalNotificationBroadcast(broadcast)
    ? 'Test nemá žiadny aktívny odber pre zvolené okruhy.'
    : undefined
  const deliverySummary = summarizeNotificationDeliveryLogs(deliveryLogs, recipients.length, emptyMessage)

  return {
    broadcast: {
      ...broadcast,
      message: deliverySummary.message,
      recipientCount: recipients.length,
      status: deliverySummary.status,
    },
    deliveryLogs,
  }
}
