import type { CatchRecord } from '~/data/pond'
import type { FishRegistrySettings } from '~/services/fishRegistryService'
import { getFishLargeCatchRule } from '~/services/fishRegistryService'
import type { LargeFishAssistanceRequest } from '~/services/largeFishAssistanceService'
import { createNotificationBroadcast } from '~/services/notificationService'
import {
  readLocalNotificationState,
  resolveLocalNotificationStorePath,
  writeLocalNotificationState,
} from './localNotificationStore'
import { runServerNotificationDelivery } from './notificationDeliveryRunner'
import { resolveNotificationDeliveryOptions } from './notificationDeliveryProvider'

interface LargeCatchNotificationInput {
  assistanceRequests: LargeFishAssistanceRequest[]
  catchRecord: CatchRecord
  fishRegistrySettings: FishRegistrySettings
  now?: string
  pegLabel: string
}

const MATCHING_CATCH_TIME_TOLERANCE_MS = 5 * 60_000

function normalizedText(value: string) {
  return value.trim().toLocaleLowerCase('sk')
}

export function findMatchingLargeFishAssistance(
  catchRecord: CatchRecord,
  requests: LargeFishAssistanceRequest[],
) {
  const caughtAt = Date.parse(catchRecord.caughtAt)

  return requests.find((request) => {
    const assistanceCaughtAt = Date.parse(request.caughtAt)
    const caughtAtMatches = Number.isFinite(caughtAt)
      && Number.isFinite(assistanceCaughtAt)
      && Math.abs(caughtAt - assistanceCaughtAt) <= MATCHING_CATCH_TIME_TOLERANCE_MS

    return (
      request.lake === catchRecord.lake
      && request.pegId === catchRecord.pegId
      && normalizedText(request.anglerName) === normalizedText(catchRecord.angler)
      && normalizedText(request.species) === normalizedText(catchRecord.species)
      && Math.abs(request.weightKg - catchRecord.weightKg) < 0.05
      && request.lengthCm === catchRecord.lengthCm
      && caughtAtMatches
    )
  })
}

export function getLargeCatchNotificationThreshold(
  catchRecord: CatchRecord,
  settings: FishRegistrySettings,
) {
  const rule = getFishLargeCatchRule(catchRecord.lake, settings)
  if (!rule?.enabled || catchRecord.weightKg < rule.thresholdKg) return undefined

  return rule.thresholdKg
}

export async function appendLargeCatchNotificationBroadcast(
  input: LargeCatchNotificationInput,
  filePath = resolveLocalNotificationStorePath(),
) {
  const thresholdKg = getLargeCatchNotificationThreshold(
    input.catchRecord,
    input.fishRegistrySettings,
  )
  if (thresholdKg === undefined) return undefined

  if (findMatchingLargeFishAssistance(input.catchRecord, input.assistanceRequests)) {
    return undefined
  }

  const state = await readLocalNotificationState(filePath)
  const result = createNotificationBroadcast(
    {
      body: `${input.catchRecord.weightKg} kg ${input.catchRecord.species} · ${input.pegLabel} · ${input.catchRecord.angler}. Úlovok čaká na moderáciu a kontrolu čipu.`,
      severity: 'water',
      targetAudience: {
        reason: `veľký úlovok nad limitom ${thresholdKg} kg bez privolania správcu`,
        requestId: input.catchRecord.id,
        roles: ['owner', 'manager'],
      },
      targetLakeIds: [input.catchRecord.lake],
      targetTopics: ['service'],
      title: 'Veľký úlovok čaká na kontrolu',
      validUntil: 'do spracovania úlovku',
    },
    state,
    'Evidencia úlovkov',
    input.now,
  )
  if (!result.ok) return undefined

  const deliveryRun = await runServerNotificationDelivery(
    result.broadcast,
    state,
    resolveNotificationDeliveryOptions(input.now),
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

export async function tryAppendLargeCatchNotificationBroadcast(
  input: LargeCatchNotificationInput,
  filePath = resolveLocalNotificationStorePath(),
) {
  try {
    return await appendLargeCatchNotificationBroadcast(input, filePath)
  }
  catch (error) {
    console.warn(`Notifikáciu k veľkému úlovku sa nepodarilo uložiť: ${(error as Error).message}`)
    return undefined
  }
}
