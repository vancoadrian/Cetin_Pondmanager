import type {
  Alert,
  LakeSlug,
  NotificationAudience,
  NotificationAudienceRole,
  NotificationBroadcast,
  NotificationDeliveryLog,
  NotificationDeliveryProvider,
  PushSubscriptionRecord,
  PushSubscriptionTopic,
} from '~/data/pond'
import {
  alerts as seedAlerts,
} from '~/data/pond'
import {
  getValidationMessages,
  notificationAlertEndInputSchema,
  notificationBroadcastInputSchema,
  notificationTestCleanupInputSchema,
  notificationTestBroadcastInputSchema,
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
  deliveryLogs: NotificationDeliveryLog[]
  message: string
  ok: true
  statusCode: 201
  subscriptions: PushSubscriptionRecord[]
}

export interface NotificationAlertEndSuccess {
  alert: Alert
  alerts: Alert[]
  broadcast?: NotificationBroadcast
  broadcasts: NotificationBroadcast[]
  message: string
  ok: true
  statusCode: 200
}

export interface NotificationTestBroadcastSuccess {
  broadcast: NotificationBroadcast
  broadcasts: NotificationBroadcast[]
  deliveryLogs: NotificationDeliveryLog[]
  message: string
  ok: true
  statusCode: 201
  subscriptions: PushSubscriptionRecord[]
}

export interface NotificationTestCleanupSuccess {
  alerts: Alert[]
  broadcasts: NotificationBroadcast[]
  cutoffAt: string
  deliveryLogs: NotificationDeliveryLog[]
  keepRecentTestBroadcasts: number
  keptRecentTestBroadcastCount: number
  message: string
  ok: true
  olderThanDays: number
  removedDeliveryLogCount: number
  removedTestBroadcastCount: number
  statusCode: 200
  subscriptions: PushSubscriptionRecord[]
}

export type PushSubscriptionMutationResult = PushSubscriptionMutationSuccess | NotificationValidationFailure
export type PushUnsubscribeResult = PushUnsubscribeSuccess | NotificationValidationFailure
export type NotificationBroadcastResult = NotificationBroadcastSuccess | NotificationValidationFailure
export type NotificationAlertEndResult = NotificationAlertEndSuccess | NotificationValidationFailure
export type NotificationTestBroadcastResult = NotificationTestBroadcastSuccess | NotificationValidationFailure
export type NotificationTestCleanupResult = NotificationTestCleanupSuccess | NotificationValidationFailure

export interface NotificationDeliveryRunOptions {
  hasVapidConfig?: boolean
  now?: string
  provider: NotificationDeliveryProvider
}

export interface NotificationDeliveryRunResult {
  broadcast: NotificationBroadcast
  deliveryLogs: NotificationDeliveryLog[]
}

export const pushSubscriptionTopicLabels: Record<PushSubscriptionTopic, string> = {
  reservations: 'rezervácie',
  service: 'prevádzka',
  tournaments: 'súťaže',
  weather: 'počasie',
}

export const notificationLakeLabels: Record<LakeSlug, string> = {
  'strkovisko-kocka': 'Štrkovisko Kocka',
  'velky-cetin': 'Veľký Cetín',
}

export const notificationAudienceRoleLabels: Record<NotificationAudienceRole, string> = {
  accountant: 'účtovník',
  angler: 'rybár',
  manager: 'správca',
  marshal: 'kontrolór',
  owner: 'majiteľ',
  tournament_organizer: 'organizátor súťaže',
  tournament_team: 'súťažný tím',
  worker: 'brigádnik',
}

function unique<T>(values: T[]) {
  return [...new Set(values)]
}

function uniqueNonEmpty(values: string[] | undefined) {
  return unique((values ?? []).map((value) => value.trim()).filter(Boolean))
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

function timestampOrZero(value: string) {
  const timestamp = Date.parse(value)

  return Number.isFinite(timestamp) ? timestamp : 0
}

export function isNotificationAlertActive(
  alert: Pick<Alert, 'endedAt' | 'expiresAt'>,
  now = new Date().toISOString(),
) {
  if (alert.endedAt) return false

  const expiresAt = alert.expiresAt ? timestampOrZero(alert.expiresAt) : 0
  if (!expiresAt) return true

  const nowTimestamp = timestampOrZero(now) || Date.now()
  return expiresAt > nowTimestamp
}

export function getActiveNotificationAlerts(
  alerts: Alert[],
  now = new Date().toISOString(),
) {
  return alerts.filter((alert) => isNotificationAlertActive(alert, now))
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

function createTestBroadcastAlertId(title: string, state: NotificationState, now: string) {
  const baseId = `test-${compactTimestamp(now)}-${slugify(title).slice(0, 32)}`

  return uniqueId(baseId, new Set(state.broadcasts.map((item) => item.alertId)))
}

export function isInternalNotificationAlertId(alertId: string) {
  return alertId.startsWith('test-')
}

export function isInternalNotificationBroadcast(broadcast: Pick<NotificationBroadcast, 'alertId'>) {
  return isInternalNotificationAlertId(broadcast.alertId)
}

function createDeliveryLogId(
  broadcast: NotificationBroadcast,
  subscription: PushSubscriptionRecord,
  state: NotificationState,
) {
  const baseId = `delivery-${slugify(broadcast.id).slice(0, 48)}-${slugify(subscription.id).slice(0, 32)}`

  return uniqueId(baseId, new Set(state.deliveryLogs.map((item) => item.id)))
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

function subscriptionMatchesAudience(
  subscription: PushSubscriptionRecord,
  audience?: NotificationAudience,
) {
  if (!audience) return true
  if (!subscription.audienceRole) return false

  const audienceRoles = audience.roles ?? []
  if (audienceRoles.length > 0 && !audienceRoles.includes(subscription.audienceRole)) {
    return false
  }

  if (
    audience.tournamentId &&
    subscription.tournamentIds?.length &&
    !subscription.tournamentIds.includes(audience.tournamentId)
  ) {
    return false
  }

  if (subscription.audienceRole === 'marshal') {
    const marshalIds = audience.marshalIds ?? []
    if (marshalIds.length > 0) {
      return Boolean(subscription.marshalId && marshalIds.includes(subscription.marshalId))
    }

    const sectorIds = audience.sectorIds ?? []
    if (sectorIds.length > 0 && subscription.sectorIds?.length) {
      return subscription.sectorIds.some((sectorId) => sectorIds.includes(sectorId))
    }
  }

  if (subscription.audienceRole === 'tournament_team') {
    const sectorIds = audience.sectorIds ?? []
    if (sectorIds.length > 0 && subscription.sectorIds?.length) {
      return subscription.sectorIds.some((sectorId) => sectorIds.includes(sectorId))
    }
  }

  return true
}

function subscriptionMatchesLakes(
  subscription: PushSubscriptionRecord,
  targetLakeIds?: LakeSlug[],
) {
  if (!targetLakeIds?.length || !subscription.lakeIds?.length) return true

  return subscription.lakeIds.some((lakeId) => targetLakeIds.includes(lakeId))
}

export function getBroadcastTargetSubscriptions(
  subscriptions: PushSubscriptionRecord[],
  targetTopics: PushSubscriptionTopic[],
  targetAudience?: NotificationAudience,
  targetLakeIds?: LakeSlug[],
) {
  return subscriptions.filter((subscription) =>
    subscription.enabled &&
    subscription.permission === 'granted' &&
    subscription.topics.some((topic) => targetTopics.includes(topic)) &&
    subscriptionMatchesAudience(subscription, targetAudience) &&
    subscriptionMatchesLakes(subscription, targetLakeIds),
  )
}

function getBroadcastRecipientCount(
  subscriptions: PushSubscriptionRecord[],
  targetTopics: PushSubscriptionTopic[],
  targetAudience?: NotificationAudience,
  targetLakeIds?: LakeSlug[],
) {
  return getBroadcastTargetSubscriptions(subscriptions, targetTopics, targetAudience, targetLakeIds).length
}

export function formatNotificationAudience(audience?: NotificationAudience) {
  if (!audience) return ''

  const parts: string[] = []
  if (audience.roles?.length) {
    parts.push(`role: ${audience.roles.map((role) => notificationAudienceRoleLabels[role]).join(', ')}`)
  }
  if (audience.tournamentId) {
    parts.push(`turnaj ${audience.tournamentId}`)
  }
  if (audience.sectorIds?.length) {
    parts.push(`sektory ${audience.sectorIds.map((sectorId) => sectorId.toUpperCase()).join(', ')}`)
  }
  if (audience.marshalIds?.length) {
    parts.push(`kontrolóri ${audience.marshalIds.join(', ')}`)
  }
  if (audience.reason) {
    parts.push(audience.reason)
  }

  return parts.join(' · ')
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

export function createPublicNotificationStateResponse(
  state: NotificationState,
  updatedAt: string,
  now = new Date().toISOString(),
): PublicNotificationStateResponse {
  return {
    alerts: getActiveNotificationAlerts(state.alerts, now),
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
  const nowTimestamp = timestampOrZero(now) || Date.now()
  const expiresAtTimestamp = input.expiresAt ? timestampOrZero(input.expiresAt) : 0
  if (input.expiresAt && expiresAtTimestamp <= nowTimestamp) {
    return failure(['Platnosť verejného oznamu musí byť v budúcnosti.'])
  }
  const targetAudience = input.targetAudience
    ? {
        ...input.targetAudience,
        marshalIds: uniqueNonEmpty(input.targetAudience.marshalIds),
        roles: unique(input.targetAudience.roles),
        sectorIds: uniqueNonEmpty(input.targetAudience.sectorIds),
      }
    : undefined
  const targetLakeIds = unique(input.targetLakeIds)
  const alert: Alert = {
    body: input.body,
    createdAt: now,
    expiresAt: input.expiresAt,
    id: createAlertId(input.title, state, now),
    lakeIds: targetLakeIds.length > 0 ? targetLakeIds : undefined,
    severity: input.severity,
    title: input.title,
    validUntil: input.validUntil,
  }
  const targetTopics = unique(input.targetTopics)
  const recipientCount = getBroadcastRecipientCount(
    state.subscriptions,
    targetTopics,
    targetAudience,
    targetLakeIds,
  )
  const broadcast: NotificationBroadcast = {
    alertId: alert.id,
    body: alert.body,
    createdAt: now,
    createdBy,
    expiresAt: input.expiresAt,
    id: createBroadcastId(alert.id, state, now),
    message: recipientCount > 0
      ? `Skúšobné doručovanie pripravilo notifikáciu pre ${recipientCount} odberov.`
      : 'Notifikácia je uložená ako verejný oznam, zatiaľ nie je aktívny žiadny odber.',
    recipientCount,
    severity: alert.severity,
    status: recipientCount > 0 ? 'prepared' : 'skipped',
    targetAudience,
    targetLakeIds: targetLakeIds.length > 0 ? targetLakeIds : undefined,
    targetTopics,
    title: alert.title,
    validUntil: alert.validUntil,
  }

  return {
    alert,
    alerts: [alert, ...state.alerts].slice(0, 50),
    broadcast,
    broadcasts: [broadcast, ...state.broadcasts].slice(0, 100),
    deliveryLogs: state.deliveryLogs,
    message: broadcast.message,
    ok: true,
    statusCode: 201,
    subscriptions: state.subscriptions,
  }
}

export function endNotificationAlert(
  rawInput: unknown,
  state: NotificationState = createEmptyNotificationState(),
  endedBy = 'Správca',
  now = new Date().toISOString(),
): NotificationAlertEndResult {
  const inputResult = notificationAlertEndInputSchema.safeParse(rawInput)
  if (!inputResult.success) {
    return failure(getValidationMessages(inputResult))
  }

  const existingAlert = state.alerts.find((alert) => alert.id === inputResult.data.alertId)
  if (!existingAlert) {
    return failure(['Verejný oznam sa nenašiel.'], 404)
  }

  const endedAt = existingAlert.endedAt ?? now
  const alert: Alert = {
    ...existingAlert,
    endedAt,
  }
  const alerts = state.alerts.map((item) => item.id === alert.id ? alert : item)
  const existingBroadcast = state.broadcasts.find((broadcast) => broadcast.alertId === alert.id)
  const broadcast = existingBroadcast
    ? {
        ...existingBroadcast,
        endedAt: existingBroadcast.endedAt ?? endedAt,
        endedBy: existingBroadcast.endedBy ?? endedBy,
      }
    : undefined
  const broadcasts = broadcast
    ? state.broadcasts.map((item) => item.id === broadcast.id ? broadcast : item)
    : state.broadcasts

  return {
    alert,
    alerts,
    broadcast,
    broadcasts,
    message: existingAlert.endedAt
      ? 'Verejný oznam už bol ukončený.'
      : 'Verejný oznam je ukončený a už sa rybárom nezobrazuje.',
    ok: true,
    statusCode: 200,
  }
}

export function createNotificationTestBroadcast(
  rawInput: unknown,
  state: NotificationState = createEmptyNotificationState(),
  createdBy = 'Správca',
  now = new Date().toISOString(),
): NotificationTestBroadcastResult {
  const inputResult = notificationTestBroadcastInputSchema.safeParse(rawInput)
  if (!inputResult.success) {
    return failure(getValidationMessages(inputResult))
  }

  const input = inputResult.data
  const targetTopics = unique(input.targetTopics)
  const recipientCount = getBroadcastRecipientCount(state.subscriptions, targetTopics)
  const alertId = createTestBroadcastAlertId(input.title, state, now)
  const broadcast: NotificationBroadcast = {
    alertId,
    body: input.body,
    createdAt: now,
    createdBy,
    id: createBroadcastId(alertId, state, now),
    message: recipientCount > 0
      ? `Testovací broadcast pripravený pre ${recipientCount} odberov.`
      : 'Test nemá žiadny aktívny odber pre zvolené okruhy.',
    recipientCount,
    severity: 'info',
    status: recipientCount > 0 ? 'prepared' : 'skipped',
    targetTopics,
    title: input.title,
    validUntil: 'interný test',
  }

  return {
    broadcast,
    broadcasts: [broadcast, ...state.broadcasts].slice(0, 100),
    deliveryLogs: state.deliveryLogs,
    message: broadcast.message,
    ok: true,
    statusCode: 201,
    subscriptions: state.subscriptions,
  }
}

export function cleanupNotificationTestBroadcasts(
  rawInput: unknown,
  state: NotificationState = createEmptyNotificationState(),
  now = new Date().toISOString(),
): NotificationTestCleanupResult {
  const inputResult = notificationTestCleanupInputSchema.safeParse(rawInput ?? {})
  if (!inputResult.success) {
    return failure(getValidationMessages(inputResult))
  }

  const input = inputResult.data
  const nowMs = timestampOrZero(now) || Date.now()
  const cutoffMs = nowMs - input.olderThanDays * 24 * 60 * 60 * 1000
  const cutoffAt = new Date(cutoffMs).toISOString()
  const sortedTestBroadcasts = state.broadcasts
    .filter((broadcast) => isInternalNotificationBroadcast(broadcast))
    .sort((a, b) => timestampOrZero(b.createdAt) - timestampOrZero(a.createdAt))
  const keptRecentTestBroadcastIds = new Set(
    sortedTestBroadcasts
      .slice(0, input.keepRecentTestBroadcasts)
      .map((broadcast) => broadcast.id),
  )
  const removedTestBroadcastIds = new Set(
    sortedTestBroadcasts
      .filter((broadcast) =>
        !keptRecentTestBroadcastIds.has(broadcast.id) &&
        timestampOrZero(broadcast.createdAt) < cutoffMs,
      )
      .map((broadcast) => broadcast.id),
  )

  const broadcasts = state.broadcasts.filter((broadcast) => !removedTestBroadcastIds.has(broadcast.id))
  const deliveryLogs = state.deliveryLogs.filter((log) => !removedTestBroadcastIds.has(log.broadcastId))
  const removedDeliveryLogCount = state.deliveryLogs.length - deliveryLogs.length
  const removedTestBroadcastCount = state.broadcasts.length - broadcasts.length

  return {
    alerts: state.alerts,
    broadcasts,
    cutoffAt,
    deliveryLogs,
    keepRecentTestBroadcasts: input.keepRecentTestBroadcasts,
    keptRecentTestBroadcastCount: keptRecentTestBroadcastIds.size,
    message: removedTestBroadcastCount > 0
      ? `Údržba vyčistila ${removedTestBroadcastCount} testovacích broadcastov a ${removedDeliveryLogCount} delivery logov.`
      : 'Údržba testov nenašla žiadny starý interný broadcast na vyčistenie.',
    ok: true,
    olderThanDays: input.olderThanDays,
    removedDeliveryLogCount,
    removedTestBroadcastCount,
    statusCode: 200,
    subscriptions: state.subscriptions,
  }
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
