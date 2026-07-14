import type { LargeFishAssistanceRequest } from '~/services/largeFishAssistanceService'
import { createNotificationBroadcast } from '~/services/notificationService'
import {
  readLocalNotificationState,
  resolveLocalNotificationStorePath,
  writeLocalNotificationState,
} from './localNotificationStore'
import { runServerNotificationDelivery } from './notificationDeliveryRunner'
import { resolveNotificationDeliveryOptions } from './notificationDeliveryProvider'

export async function appendLargeFishAssistanceNotification(
  request: LargeFishAssistanceRequest,
  filePath = resolveLocalNotificationStorePath(),
) {
  const state = await readLocalNotificationState(filePath)
  const result = createNotificationBroadcast(
    {
      body: `${request.weightKg} kg ${request.species} · ${request.pegLabel} · ${request.anglerName} · ${request.phone}`,
      severity: 'water',
      targetAudience: {
        reason: 'privolanie správcu k veľkej rybe',
        requestId: request.id,
        roles: ['owner', 'manager'],
      },
      targetLakeIds: [request.lake],
      targetTopics: ['service'],
      title: 'Veľká ryba: správca potrebný',
      validUntil: 'do odpovede správcu',
    },
    state,
    'Privolanie správcu',
    request.createdAt,
  )

  if (!result.ok) return undefined

  const deliveryRun = await runServerNotificationDelivery(
    result.broadcast,
    state,
    resolveNotificationDeliveryOptions(request.createdAt),
  )
  const broadcasts = result.broadcasts.map((broadcast) =>
    broadcast.id === deliveryRun.broadcast.id ? deliveryRun.broadcast : broadcast,
  )
  const deliveryLogs = [...deliveryRun.deliveryLogs, ...state.deliveryLogs].slice(0, 500)

  await writeLocalNotificationState({
    alerts: state.alerts,
    broadcasts,
    deliveryLogs,
    subscriptions: state.subscriptions,
  }, filePath)

  return {
    broadcast: deliveryRun.broadcast,
    deliveryLogs,
  }
}

export async function tryAppendLargeFishAssistanceNotification(
  request: LargeFishAssistanceRequest,
  filePath = resolveLocalNotificationStorePath(),
) {
  try {
    return await appendLargeFishAssistanceNotification(request, filePath)
  }
  catch (error) {
    console.warn(`Notifikáciu privolania správcu sa nepodarilo uložiť: ${(error as Error).message}`)
    return undefined
  }
}
