import type {
  Alert,
  LakeSlug,
  NotificationAudience,
  NotificationAudienceRole,
  NotificationBroadcast,
  NotificationDeliveryLog,
  PushSubscriptionRecord,
  PushSubscriptionTopic,
} from '~/data/pond'
import {
  getValidationMessages,
  notificationAlertEndInputSchema,
  notificationBroadcastInputSchema,
  notificationTestCleanupInputSchema,
  notificationTestBroadcastInputSchema,
} from '~/schemas/pondSchemas'
import {
  compactTimestamp,
  createEmptyNotificationState,
  failure,
  unique,
  uniqueId,
  uniqueNonEmpty,
  type NotificationState,
  type NotificationValidationFailure,
} from '~/services/notificationService'

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

export interface PublicNotificationStateResponse {
  alerts: Alert[]
  ok: true
  subscriptionCount: number
  updatedAt: string
}

export type NotificationBroadcastResult = NotificationBroadcastSuccess | NotificationValidationFailure
export type NotificationAlertEndResult = NotificationAlertEndSuccess | NotificationValidationFailure
export type NotificationTestBroadcastResult = NotificationTestBroadcastSuccess | NotificationValidationFailure
export type NotificationTestCleanupResult = NotificationTestCleanupSuccess | NotificationValidationFailure

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

/** Shared with notificationDeliveryService for alert/broadcast/delivery-log ids. */
export function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'zaznam'
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
