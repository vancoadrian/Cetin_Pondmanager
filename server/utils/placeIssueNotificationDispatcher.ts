import type { AlertSeverity, NotificationAudience, NotificationAudienceRole, PlaceIssue } from '~/data/pond'
import { placeIssueCategoryLabels, placeIssuePriorityLabels } from '~/data/pond'
import type { NotificationBroadcastSuccess } from '~/services/notificationService'
import { createNotificationBroadcast } from '~/services/notificationService'
import {
  readLocalNotificationState,
  resolveLocalNotificationStorePath,
  writeLocalNotificationState,
} from './localNotificationStore'
import { runServerNotificationDelivery } from './notificationDeliveryRunner'
import { resolveNotificationDeliveryOptions } from './notificationDeliveryProvider'

interface PlaceIssueNotificationInput {
  createdBy?: string
  issue: Pick<PlaceIssue, 'category' | 'description' | 'id' | 'priority' | 'targetLabel' | 'title'>
  now?: string
  roles?: NotificationAudienceRole[]
  validUntil?: string
}

const defaultPlaceIssueAudienceRoles: NotificationAudienceRole[] = ['owner', 'manager', 'worker']

function limitText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value
}

function createPlaceIssueNotificationAudience(input: PlaceIssueNotificationInput): NotificationAudience {
  return {
    reason: `${placeIssuePriorityLabels[input.issue.priority]} hlásenie nedostatku`,
    requestId: input.issue.id,
    roles: [...new Set(input.roles ?? defaultPlaceIssueAudienceRoles)],
  }
}

function createPlaceIssueNotificationSeverity(issue: Pick<PlaceIssue, 'priority'>): AlertSeverity {
  return issue.priority === 'urgent' ? 'service' : 'info'
}

function createPlaceIssueNotificationTitle(issue: Pick<PlaceIssue, 'priority' | 'title'>) {
  return limitText(
    issue.priority === 'urgent'
      ? `Urgentný nedostatok: ${issue.title}`
      : `Nový nedostatok: ${issue.title}`,
    80,
  )
}

function createPlaceIssueNotificationBody(
  issue: Pick<PlaceIssue, 'category' | 'description' | 'targetLabel'>,
) {
  return limitText(
    `${issue.targetLabel} · ${placeIssueCategoryLabels[issue.category]}: ${issue.description}`,
    280,
  )
}

export async function appendPlaceIssueNotificationBroadcast(
  input: PlaceIssueNotificationInput,
  filePath = resolveLocalNotificationStorePath(),
): Promise<NotificationBroadcastSuccess | undefined> {
  const state = await readLocalNotificationState(filePath)
  const result = createNotificationBroadcast(
    {
      body: createPlaceIssueNotificationBody(input.issue),
      severity: createPlaceIssueNotificationSeverity(input.issue),
      targetAudience: createPlaceIssueNotificationAudience(input),
      targetTopics: ['service'],
      title: createPlaceIssueNotificationTitle(input.issue),
      validUntil: input.validUntil ?? 'do vyriešenia',
    },
    state,
    input.createdBy ?? 'Prevádzkové hlásenia',
    input.now,
  )

  if (!result.ok) {
    console.warn(`Notifikáciu k hláseniu nedostatku sa nepodarilo pripraviť: ${result.messages.join(' ')}`)
    return undefined
  }

  const deliveryRun = await runServerNotificationDelivery(
    result.broadcast,
    state,
    resolveNotificationDeliveryOptions(input.now),
  )
  const broadcasts = result.broadcasts.map((broadcast) =>
    broadcast.id === deliveryRun.broadcast.id ? deliveryRun.broadcast : broadcast,
  )
  const deliveryLogs = [...deliveryRun.deliveryLogs, ...state.deliveryLogs].slice(0, 500)

  await writeLocalNotificationState(
    {
      alerts: result.alerts,
      broadcasts,
      deliveryLogs,
      subscriptions: result.subscriptions,
    },
    filePath,
  )

  return {
    ...result,
    broadcast: deliveryRun.broadcast,
    broadcasts,
    deliveryLogs,
    message: deliveryRun.broadcast.message,
  }
}

export async function tryAppendPlaceIssueNotificationBroadcast(
  input: PlaceIssueNotificationInput,
  filePath = resolveLocalNotificationStorePath(),
) {
  try {
    return await appendPlaceIssueNotificationBroadcast(input, filePath)
  }
  catch (error) {
    const maybeError = error as Error
    console.warn(`Notifikáciu k hláseniu nedostatku sa nepodarilo uložiť: ${maybeError.message}`)
    return undefined
  }
}
