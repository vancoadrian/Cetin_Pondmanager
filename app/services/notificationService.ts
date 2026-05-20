import type {
  Alert,
  NotificationBroadcast,
  PushSubscriptionRecord,
  PushSubscriptionTopic,
} from '~/data/pond'
import {
  alerts as seedAlerts,
} from '~/data/pond'
import {
  getValidationMessages,
  notificationBroadcastInputSchema,
  pushSubscriptionInputSchema,
  pushUnsubscribeInputSchema,
} from '~/schemas/pondSchemas'

export interface NotificationState {
  alerts: Alert[]
  broadcasts: NotificationBroadcast[]
  subscriptions: PushSubscriptionRecord[]
}

export interface NotificationStateResponse extends NotificationState {
  ok: true
  subscriptionCount: number
  updatedAt: string
}

export interface PublicNotificationStateResponse {
  alerts: Alert[]
  ok: true
  subscriptionCount: number
  updatedAt: string
}

export interface NotificationValidationFailure {
  messages: string[]
  ok: false
  statusCode: 400 | 404 | 422
}

export interface PushSubscriptionMutationSuccess {
  message: string
  ok: true
  statusCode: 200 | 201
  subscription: PushSubscriptionRecord
  subscriptions: PushSubscriptionRecord[]
}

export interface PushUnsubscribeSuccess {
  message: string
  ok: true
  statusCode: 200
  subscription?: PushSubscriptionRecord
  subscriptions: PushSubscriptionRecord[]
}

export interface NotificationBroadcastSuccess {
  alert: Alert
  alerts: Alert[]
  broadcast: NotificationBroadcast
  broadcasts: NotificationBroadcast[]
  message: string
  ok: true
  statusCode: 201
  subscriptions: PushSubscriptionRecord[]
}

export type PushSubscriptionMutationResult = PushSubscriptionMutationSuccess | NotificationValidationFailure
export type PushUnsubscribeResult = PushUnsubscribeSuccess | NotificationValidationFailure
export type NotificationBroadcastResult = NotificationBroadcastSuccess | NotificationValidationFailure

export const pushSubscriptionTopicLabels: Record<PushSubscriptionTopic, string> = {
  reservations: 'rezervácie',
  service: 'prevádzka',
  tournaments: 'súťaže',
  weather: 'počasie',
}

function unique<T>(values: T[]) {
  return [...new Set(values)]
}

function failure(
  messages: string[],
  statusCode: NotificationValidationFailure['statusCode'] = 422,
): NotificationValidationFailure {
  return {
    messages: unique(messages),
    ok: false,
    statusCode,
  }
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'zaznam'
}

function compactTimestamp(value: string) {
  const timestamp = Date.parse(value)
  const date = Number.isFinite(timestamp) ? new Date(timestamp) : new Date()

  return date.toISOString().replace(/\D/g, '').slice(0, 14)
}

function uniqueId(baseId: string, existingIds: Set<string>) {
  if (!existingIds.has(baseId)) return baseId

  let index = 2
  while (existingIds.has(`${baseId}-${index}`)) {
    index += 1
  }

  return `${baseId}-${index}`
}

function createSubscriptionId(endpoint: string, state: NotificationState, now: string) {
  const endpointTail = endpoint.replace(/[^a-zA-Z0-9]+/g, '').slice(-18) || compactTimestamp(now)

  return uniqueId(`push-${endpointTail.toLowerCase()}`, new Set(state.subscriptions.map((item) => item.id)))
}

function createAlertId(title: string, state: NotificationState, now: string) {
  const baseId = `alert-${compactTimestamp(now)}-${slugify(title).slice(0, 32)}`

  return uniqueId(baseId, new Set(state.alerts.map((item) => item.id)))
}

function createBroadcastId(alertId: string, state: NotificationState, now: string) {
  const baseId = `broadcast-${compactTimestamp(now)}-${slugify(alertId).slice(0, 28)}`

  return uniqueId(baseId, new Set(state.broadcasts.map((item) => item.id)))
}

export function cloneNotificationState(state: NotificationState): NotificationState {
  return {
    alerts: state.alerts.map((alert) => ({ ...alert })),
    broadcasts: state.broadcasts.map((broadcast) => ({
      ...broadcast,
      targetTopics: [...broadcast.targetTopics],
    })),
    subscriptions: state.subscriptions.map((subscription) => ({
      ...subscription,
      topics: [...subscription.topics],
    })),
  }
}

export function createEmptyNotificationState(): NotificationState {
  return {
    alerts: seedAlerts.map((alert) => ({ ...alert })),
    broadcasts: [],
    subscriptions: [],
  }
}

export function createPublicNotificationStateResponse(
  state: NotificationState,
  updatedAt: string,
): PublicNotificationStateResponse {
  return {
    alerts: state.alerts,
    ok: true,
    subscriptionCount: state.subscriptions.filter((subscription) => subscription.enabled).length,
    updatedAt,
  }
}

export function savePushSubscription(
  rawInput: unknown,
  state: NotificationState = createEmptyNotificationState(),
  now = new Date().toISOString(),
): PushSubscriptionMutationResult {
  const inputResult = pushSubscriptionInputSchema.safeParse(rawInput)
  if (!inputResult.success) {
    return failure(getValidationMessages(inputResult))
  }

  const input = inputResult.data
  const existingSubscription = state.subscriptions.find((subscription) => subscription.endpoint === input.endpoint)
  const subscription: PushSubscriptionRecord = {
    auth: input.auth || existingSubscription?.auth,
    createdAt: existingSubscription?.createdAt ?? now,
    deviceLabel: input.deviceLabel?.trim() || existingSubscription?.deviceLabel || 'Toto zariadenie',
    enabled: input.permission === 'granted',
    endpoint: input.endpoint,
    id: existingSubscription?.id ?? createSubscriptionId(input.endpoint, state, now),
    lastSeenAt: now,
    p256dh: input.p256dh || existingSubscription?.p256dh,
    permission: input.permission,
    topics: unique(input.topics),
    updatedAt: now,
    userAgent: input.userAgent || existingSubscription?.userAgent || 'unknown',
  }
  const subscriptions = existingSubscription
    ? state.subscriptions.map((item) => item.id === subscription.id ? subscription : item)
    : [subscription, ...state.subscriptions]

  return {
    message: existingSubscription
      ? 'Odber notifikácií je aktualizovaný.'
      : 'Odber notifikácií je uložený.',
    ok: true,
    statusCode: existingSubscription ? 200 : 201,
    subscription,
    subscriptions,
  }
}

export function disablePushSubscription(
  rawInput: unknown,
  state: NotificationState = createEmptyNotificationState(),
  now = new Date().toISOString(),
): PushUnsubscribeResult {
  const inputResult = pushUnsubscribeInputSchema.safeParse(rawInput)
  if (!inputResult.success) {
    return failure(getValidationMessages(inputResult))
  }

  const input = inputResult.data
  const existingSubscription = state.subscriptions.find((subscription) => subscription.endpoint === input.endpoint)
  if (!existingSubscription) {
    return failure(['Odber notifikácií sa nenašiel.'], 404)
  }

  const subscription: PushSubscriptionRecord = {
    ...existingSubscription,
    enabled: false,
    lastSeenAt: now,
    permission: 'denied',
    updatedAt: now,
  }

  return {
    message: 'Odber notifikácií je vypnutý.',
    ok: true,
    statusCode: 200,
    subscription,
    subscriptions: state.subscriptions.map((item) => item.id === subscription.id ? subscription : item),
  }
}

export function createNotificationBroadcast(
  rawInput: unknown,
  state: NotificationState = createEmptyNotificationState(),
  createdBy = 'Správca',
  now = new Date().toISOString(),
): NotificationBroadcastResult {
  const inputResult = notificationBroadcastInputSchema.safeParse(rawInput)
  if (!inputResult.success) {
    return failure(getValidationMessages(inputResult))
  }

  const input = inputResult.data
  const alert: Alert = {
    body: input.body,
    id: createAlertId(input.title, state, now),
    severity: input.severity,
    title: input.title,
    validUntil: input.validUntil,
  }
  const recipientCount = state.subscriptions.filter((subscription) =>
    subscription.enabled &&
    subscription.permission === 'granted' &&
    subscription.topics.some((topic) => input.targetTopics.includes(topic)),
  ).length
  const broadcast: NotificationBroadcast = {
    alertId: alert.id,
    body: alert.body,
    createdAt: now,
    createdBy,
    id: createBroadcastId(alert.id, state, now),
    message: recipientCount > 0
      ? `Mock dispatcher pripravil notifikáciu pre ${recipientCount} odberov.`
      : 'Notifikácia je uložená ako verejný oznam, zatiaľ nie je aktívny žiadny odber.',
    recipientCount,
    severity: alert.severity,
    status: recipientCount > 0 ? 'prepared' : 'skipped',
    targetTopics: unique(input.targetTopics),
    title: alert.title,
    validUntil: alert.validUntil,
  }

  return {
    alert,
    alerts: [alert, ...state.alerts].slice(0, 50),
    broadcast,
    broadcasts: [broadcast, ...state.broadcasts].slice(0, 100),
    message: broadcast.message,
    ok: true,
    statusCode: 201,
    subscriptions: state.subscriptions,
  }
}
