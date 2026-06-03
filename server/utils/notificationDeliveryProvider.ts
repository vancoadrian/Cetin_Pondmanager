import type { NotificationDeliveryProvider } from '~/data/pond'
import type {
  NotificationDeliveryDiagnostics,
  NotificationDeliveryRunOptions,
} from '~/services/notificationService'
import type { Urgency } from 'web-push'

export interface ServerNotificationDeliveryOptions extends NotificationDeliveryRunOptions {
  subject?: string
  timeoutMs?: number
  ttlSeconds?: number
  urgency?: Urgency
  vapidPrivateKey?: string
  vapidPublicKey?: string
}

const supportedProviders = ['disabled', 'mock', 'web-push'] as const
const supportedUrgency = ['very-low', 'low', 'normal', 'high'] as const

function parseProvider(value: string | undefined): NotificationDeliveryProvider {
  return supportedProviders.includes(value as NotificationDeliveryProvider)
    ? value as NotificationDeliveryProvider
    : 'mock'
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseUrgency(value: string | undefined): Urgency {
  return supportedUrgency.includes(value as Urgency) ? value as Urgency : 'normal'
}

function getMissingVapidConfigKeys(options: ServerNotificationDeliveryOptions) {
  return [
    options.vapidPublicKey ? '' : 'NUXT_PUBLIC_VAPID_PUBLIC_KEY',
    options.vapidPrivateKey ? '' : 'RYBOLOV_VAPID_PRIVATE_KEY',
    options.subject ? '' : 'RYBOLOV_PUSH_SUBJECT',
  ].filter(Boolean)
}

export function resolveNotificationDeliveryOptions(
  now = new Date().toISOString(),
): ServerNotificationDeliveryOptions {
  const provider = parseProvider(process.env.RYBOLOV_PUSH_PROVIDER)
  const vapidPublicKey = process.env.NUXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.RYBOLOV_VAPID_PRIVATE_KEY
  const subject = process.env.RYBOLOV_PUSH_SUBJECT
  const hasVapidConfig = Boolean(
    vapidPublicKey &&
    vapidPrivateKey &&
    subject,
  )

  return {
    hasVapidConfig,
    now,
    provider,
    subject,
    timeoutMs: parsePositiveInteger(process.env.RYBOLOV_PUSH_TIMEOUT_MS, 10_000),
    ttlSeconds: parsePositiveInteger(process.env.RYBOLOV_PUSH_TTL_SECONDS, 60 * 60),
    urgency: parseUrgency(process.env.RYBOLOV_PUSH_URGENCY),
    vapidPrivateKey,
    vapidPublicKey,
  }
}

export function createNotificationDeliveryDiagnostics(
  options = resolveNotificationDeliveryOptions(),
): NotificationDeliveryDiagnostics {
  const missingConfigKeys = getMissingVapidConfigKeys(options)
  const hasVapidConfig = Boolean(options.hasVapidConfig)

  return {
    hasVapidConfig,
    missingConfigKeys,
    provider: options.provider,
    subject: options.subject,
    timeoutMs: options.timeoutMs ?? 10_000,
    ttlSeconds: options.ttlSeconds ?? 60 * 60,
    urgency: options.urgency ?? 'normal',
    webPushReady: options.provider === 'web-push' && hasVapidConfig,
  }
}
