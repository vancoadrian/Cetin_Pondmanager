import type {
  Alert,
  NotificationBroadcast,
  NotificationDeliveryLog,
  PushSubscriptionRecord,
  PushSubscriptionTopic,
} from '~/data/pond'
import {
  alerts as seedAlerts,
} from '~/data/pond'
import {
  getValidationMessages,
  pushSubscriptionAdminDisableInputSchema,
  pushSubscriptionInputSchema,
  pushUnsubscribeInputSchema,
} from '~/schemas/pondSchemas'

export interface NotificationState {
  alerts: Alert[]
  broadcasts: NotificationBroadcast[]
  deliveryLogs: NotificationDeliveryLog[]
  subscriptions: PushSubscriptionRecord[]
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

export type PushSubscriptionMutationResult = PushSubscriptionMutationSuccess | NotificationValidationFailure
export type PushUnsubscribeResult = PushUnsubscribeSuccess | NotificationValidationFailure

export const pushSubscriptionTopicLabels: Record<PushSubscriptionTopic, string> = {
  reservations: 'rezervácie',
  service: 'prevádzka',
  tournaments: 'súťaže',
  weather: 'počasie',
}

/**
 * Shared across the notification service modules (broadcast, delivery) so
 * every module dedupes the same way.
 */
export function unique<T>(values: T[]) {
  return [...new Set(values)]
}

/** Shared with notificationBroadcastService for audience scope fields. */
export function uniqueNonEmpty(values: string[] | undefined) {
  return unique((values ?? []).map((value) => value.trim()).filter(Boolean))
}

/** Shared across the notification service modules for validation failures. */
export function failure(
  messages: string[],
  statusCode: NotificationValidationFailure['statusCode'] = 422,
): NotificationValidationFailure {
  return {
    messages: unique(messages),
    ok: false,
    statusCode,
  }
}

/** Shared with notificationBroadcastService for alert/broadcast ids. */
export function compactTimestamp(value: string) {
  const timestamp = Date.parse(value)
  const date = Number.isFinite(timestamp) ? new Date(timestamp) : new Date()

  return date.toISOString().replace(/\D/g, '').slice(0, 14)
}

/** Shared across the notification service modules for id generation. */
export function uniqueId(baseId: string, existingIds: Set<string>) {
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

export function cloneNotificationState(state: NotificationState): NotificationState {
  return {
    alerts: state.alerts.map((alert) => ({
      ...alert,
      lakeIds: alert.lakeIds ? [...alert.lakeIds] : undefined,
    })),
    broadcasts: state.broadcasts.map((broadcast) => ({
      ...broadcast,
      targetAudience: broadcast.targetAudience
        ? {
            ...broadcast.targetAudience,
            marshalIds: [...(broadcast.targetAudience.marshalIds ?? [])],
            roles: [...(broadcast.targetAudience.roles ?? [])],
            sectorIds: [...(broadcast.targetAudience.sectorIds ?? [])],
        }
        : undefined,
      targetLakeIds: broadcast.targetLakeIds ? [...broadcast.targetLakeIds] : undefined,
      targetTopics: [...broadcast.targetTopics],
    })),
    deliveryLogs: state.deliveryLogs.map((log) => ({ ...log })),
    subscriptions: state.subscriptions.map((subscription) => ({
      ...subscription,
      lakeIds: subscription.lakeIds ? [...subscription.lakeIds] : undefined,
      sectorIds: [...(subscription.sectorIds ?? [])],
      topics: [...subscription.topics],
      tournamentIds: [...(subscription.tournamentIds ?? [])],
    })),
  }
}

export function createEmptyNotificationState(): NotificationState {
  return {
    alerts: seedAlerts.map((alert) => ({ ...alert })),
    broadcasts: [],
    deliveryLogs: [],
    subscriptions: [],
  }
}

export function stripPushSubscriptionAudienceScope(rawInput: unknown) {
  if (typeof rawInput !== 'object' || rawInput === null || Array.isArray(rawInput)) {
    return rawInput
  }

  return {
    ...rawInput,
    audienceRole: undefined,
    marshalId: undefined,
    sectorIds: [],
    tournamentIds: [],
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
    audienceRole: input.audienceRole ?? existingSubscription?.audienceRole,
    createdAt: existingSubscription?.createdAt ?? now,
    deviceLabel: input.deviceLabel?.trim() || existingSubscription?.deviceLabel || 'Toto zariadenie',
    enabled: input.permission === 'granted',
    endpoint: input.endpoint,
    id: existingSubscription?.id ?? createSubscriptionId(input.endpoint, state, now),
    lakeIds: input.lakeIds === undefined
      ? existingSubscription?.lakeIds ?? []
      : unique(input.lakeIds),
    lastSeenAt: now,
    marshalId: input.marshalId ?? existingSubscription?.marshalId,
    p256dh: input.p256dh || existingSubscription?.p256dh,
    permission: input.permission,
    sectorIds: uniqueNonEmpty(input.sectorIds).length > 0
      ? uniqueNonEmpty(input.sectorIds)
      : existingSubscription?.sectorIds ?? [],
    topics: unique(input.topics),
    tournamentIds: uniqueNonEmpty(input.tournamentIds).length > 0
      ? uniqueNonEmpty(input.tournamentIds)
      : existingSubscription?.tournamentIds ?? [],
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

export function disablePushSubscriptionById(
  rawInput: unknown,
  state: NotificationState = createEmptyNotificationState(),
  now = new Date().toISOString(),
): PushSubscriptionMutationResult {
  const inputResult = pushSubscriptionAdminDisableInputSchema.safeParse(rawInput)
  if (!inputResult.success) {
    return failure(getValidationMessages(inputResult))
  }

  const input = inputResult.data
  const existingSubscription = state.subscriptions.find((subscription) => subscription.id === input.subscriptionId)
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
    message: `Odber zariadenia ${subscription.deviceLabel} je vypnutý.`,
    ok: true,
    statusCode: 200,
    subscription,
    subscriptions: state.subscriptions.map((item) => item.id === subscription.id ? subscription : item),
  }
}
