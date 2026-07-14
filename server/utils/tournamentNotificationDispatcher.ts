import type { LakeSlug, NotificationAudience, NotificationAudienceRole } from '~/data/pond'
import type { NotificationBroadcastSuccess } from '~/services/notificationService'
import { createNotificationBroadcast } from '~/services/notificationService'
import {
  readLocalNotificationState,
  resolveLocalNotificationStorePath,
  writeLocalNotificationState,
} from './localNotificationStore'
import { runServerNotificationDelivery } from './notificationDeliveryRunner'
import { resolveNotificationDeliveryOptions } from './notificationDeliveryProvider'

interface TournamentNotificationInput {
  body: string
  createdBy?: string
  lake?: LakeSlug
  marshalIds?: string[]
  now?: string
  reason?: string
  requestId?: string
  roles?: NotificationAudienceRole[]
  sectorIds?: string[]
  title: string
  tournamentId?: string
  validUntil?: string
}

function createTournamentNotificationAudience(input: TournamentNotificationInput): NotificationAudience | undefined {
  const roles = [...new Set(input.roles ?? [])]
  const sectorIds = [...new Set((input.sectorIds ?? []).filter(Boolean))]
  const marshalIds = [...new Set((input.marshalIds ?? []).filter(Boolean))]

  if (!input.tournamentId && roles.length === 0 && sectorIds.length === 0 && marshalIds.length === 0 && !input.requestId && !input.reason) {
    return undefined
  }

  return {
    marshalIds,
    reason: input.reason,
    requestId: input.requestId,
    roles,
    sectorIds,
    tournamentId: input.tournamentId,
  }
}

export async function appendTournamentNotificationBroadcast(
  input: TournamentNotificationInput,
  filePath = resolveLocalNotificationStorePath(),
): Promise<NotificationBroadcastSuccess | undefined> {
  const state = await readLocalNotificationState(filePath)
  const result = createNotificationBroadcast(
    {
      body: input.body,
      severity: 'info',
      targetAudience: createTournamentNotificationAudience(input),
      targetLakeIds: input.lake ? [input.lake] : [],
      targetTopics: ['tournaments'],
      title: input.title,
      validUntil: input.validUntil ?? 'dnes 23:59',
    },
    state,
    input.createdBy ?? 'Súťažný dispečing',
    input.now,
  )

  if (!result.ok) {
    console.warn(`Súťažnú notifikáciu sa nepodarilo pripraviť: ${result.messages.join(' ')}`)
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

export async function tryAppendTournamentNotificationBroadcast(
  input: TournamentNotificationInput,
  filePath = resolveLocalNotificationStorePath(),
) {
  try {
    return await appendTournamentNotificationBroadcast(input, filePath)
  }
  catch (error) {
    const maybeError = error as Error
    console.warn(`Súťažnú notifikáciu sa nepodarilo uložiť: ${maybeError.message}`)
    return undefined
  }
}
