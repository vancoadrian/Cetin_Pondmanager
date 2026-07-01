import type {
  NotificationBroadcast,
  NotificationDeliveryLog,
  PushSubscriptionRecord,
} from '~/data/pond'
import {
  getBroadcastTargetSubscriptions,
  runNotificationDelivery,
  summarizeNotificationDeliveryLogs,
  type NotificationDeliveryRunResult,
  type NotificationState,
} from '~/services/notificationService'
import type { PushSubscription as WebPushSubscription, RequestOptions, SendResult } from 'web-push'
import type { ServerNotificationDeliveryOptions } from './notificationDeliveryProvider'

export type WebPushSender = (
  subscription: WebPushSubscription,
  payload: string,
  options: RequestOptions,
) => Promise<Pick<SendResult, 'statusCode'>>

interface WebPushModule {
  default?: {
    sendNotification?: WebPushSender
  }
  sendNotification?: WebPushSender
}

export interface ServerNotificationDeliveryRunnerOptions extends ServerNotificationDeliveryOptions {
  sendWebPush?: WebPushSender
}

function createNotificationUrl(broadcast: NotificationBroadcast) {
  const requestId = broadcast.targetAudience?.requestId
  if (requestId?.startsWith('fish-help-')) {
    return `/admin/ryby?privolanie=${encodeURIComponent(requestId)}`
  }
  if (requestId?.startsWith('catch-')) {
    return `/admin/ulovky?catchId=${encodeURIComponent(requestId)}`
  }

  if (broadcast.targetTopics.includes('tournaments')) {
    const tournamentId = broadcast.targetAudience?.tournamentId

    return tournamentId ? `/sutaze?turnaj=${encodeURIComponent(tournamentId)}` : '/sutaze'
  }

  if (broadcast.targetTopics.includes('reservations')) {
    const requestId = broadcast.targetAudience?.requestId
    const hasInternalAudience = Boolean(broadcast.targetAudience?.roles?.length)

    if (hasInternalAudience) {
      return requestId
        ? `/admin/rezervacie?rezervacia=${encodeURIComponent(requestId)}`
        : '/admin/rezervacie'
    }

    return '/rezervacie'
  }

  return '/notifikacie'
}

function createWebPushPayload(broadcast: NotificationBroadcast) {
  return JSON.stringify({
    body: broadcast.body,
    broadcastId: broadcast.id,
    severity: broadcast.severity,
    title: broadcast.title,
    url: createNotificationUrl(broadcast),
    validUntil: broadcast.validUntil,
  })
}

async function defaultWebPushSender(
  subscription: WebPushSubscription,
  payload: string,
  options: RequestOptions,
) {
  const webPush = await import('web-push') as unknown as WebPushModule
  const sendNotification = webPush.sendNotification ?? webPush.default?.sendNotification
  if (!sendNotification) {
    throw new Error('web-push module does not expose sendNotification.')
  }

  return sendNotification(subscription, payload, options)
}

function createWebPushSubscription(subscription: PushSubscriptionRecord): WebPushSubscription | undefined {
  if (!subscription.p256dh || !subscription.auth) return undefined

  return {
    endpoint: subscription.endpoint,
    keys: {
      auth: subscription.auth,
      p256dh: subscription.p256dh,
    },
  }
}

function getWebPushErrorMessage(error: unknown) {
  const maybeWebPushError = error as {
    body?: string
    message?: string
    statusCode?: number
  }

  if (maybeWebPushError.statusCode) {
    return `Web Push zlyhal s HTTP ${maybeWebPushError.statusCode}.`
  }

  return maybeWebPushError.message
    ? `Web Push zlyhal: ${maybeWebPushError.message}`
    : 'Web Push zlyhal bez detailu odpovede.'
}

function withBroadcastDeliverySummary(
  broadcast: NotificationBroadcast,
  deliveryLogs: NotificationDeliveryLog[],
): NotificationDeliveryRunResult {
  const summary = summarizeNotificationDeliveryLogs(deliveryLogs, deliveryLogs.length)

  return {
    broadcast: {
      ...broadcast,
      message: summary.message,
      recipientCount: deliveryLogs.length,
      status: summary.status,
    },
    deliveryLogs,
  }
}

export async function runServerNotificationDelivery(
  broadcast: NotificationBroadcast,
  state: NotificationState,
  options: ServerNotificationDeliveryRunnerOptions,
): Promise<NotificationDeliveryRunResult> {
  const preparedRun = runNotificationDelivery(broadcast, state, options)
  if (
    options.provider !== 'web-push' ||
    !options.hasVapidConfig ||
    !options.vapidPublicKey ||
    !options.vapidPrivateKey ||
    !options.subject
  ) {
    return preparedRun
  }

  const payload = createWebPushPayload(broadcast)
  const recipients = new Map(
    getBroadcastTargetSubscriptions(
      state.subscriptions,
      broadcast.targetTopics,
      broadcast.targetAudience,
    ).map((subscription) => [subscription.id, subscription]),
  )
  const sendWebPush = options.sendWebPush ?? defaultWebPushSender
  const requestOptions: RequestOptions = {
    TTL: options.ttlSeconds,
    timeout: options.timeoutMs,
    urgency: options.urgency,
    vapidDetails: {
      privateKey: options.vapidPrivateKey,
      publicKey: options.vapidPublicKey,
      subject: options.subject,
    },
  }
  const deliveryLogs = await Promise.all(preparedRun.deliveryLogs.map(async (log) => {
    const subscription = recipients.get(log.subscriptionId)
    if (!subscription) {
      return {
        ...log,
        message: 'Odber už nie je dostupný v aktuálnom stave notifikácií.',
        status: 'failed' as const,
      }
    }

    if (subscription.endpoint.startsWith('mock://')) {
      return log
    }

    const webPushSubscription = createWebPushSubscription(subscription)
    if (!webPushSubscription) {
      return {
        ...log,
        message: 'Odber nemá kompletné Web Push kľúče p256dh/auth.',
        status: 'failed' as const,
      }
    }

    try {
      const response = await sendWebPush(webPushSubscription, payload, requestOptions)

      return {
        ...log,
        message: `Web Push odoslaný, push služba vrátila HTTP ${response.statusCode}.`,
        status: 'sent' as const,
      }
    }
    catch (error) {
      return {
        ...log,
        message: getWebPushErrorMessage(error),
        status: 'failed' as const,
      }
    }
  }))

  return withBroadcastDeliverySummary(preparedRun.broadcast, deliveryLogs)
}
