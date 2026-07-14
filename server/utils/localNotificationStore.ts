import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  cloneNotificationState,
  createEmptyNotificationState,
  type NotificationState,
} from '~/services/notificationService'

export interface LocalNotificationState extends NotificationState {
  updatedAt: string
  version: 1
}

export function resolveLocalNotificationStorePath() {
  return process.env.RYBOLOV_LOCAL_NOTIFICATION_STORE
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'notification-state.json')
}

export function createSeedNotificationState(updatedAt = new Date(0).toISOString()): LocalNotificationState {
  return {
    ...createEmptyNotificationState(),
    updatedAt,
    version: 1,
  }
}

function isNotificationState(value: unknown): value is LocalNotificationState {
  const candidate = value as Partial<LocalNotificationState>

  return (
    candidate.version === 1 &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.alerts) &&
    (candidate.broadcasts === undefined || Array.isArray(candidate.broadcasts)) &&
    (candidate.deliveryLogs === undefined || Array.isArray(candidate.deliveryLogs)) &&
    (candidate.subscriptions === undefined || Array.isArray(candidate.subscriptions))
  )
}

function normalizeLegacyNotificationMessage(message: string) {
  return message
    .replace(/^Mock dispatcher pripravil notifikáciu pre (\d+) odberov\.$/u, 'Skúšobné doručovanie pripravilo notifikáciu pre $1 odberov.')
    .replace(/^Mock dispatcher označil notifikáciu ako doručenú\.$/u, 'Skúšobné doručovanie označilo notifikáciu ako doručenú.')
    .replace(/^Mock dispatcher zaevidoval (\d+) doručení\.$/u, 'Skúšobné doručovanie zaevidovalo $1 doručení.')
    .replace(/^Mock endpoint čaká na reálny Web Push endpoint zariadenia\.$/u, 'Skúšobný odber čaká na reálny Web Push endpoint zariadenia.')
    .replace(/^Mock doručenie\.$/u, 'Skúšobné doručenie.')
}

function normalizeLegacyValidUntil(validUntil: string) {
  return validUntil === 'pondelok' ? 'pondelka' : validUntil
}

function inferLegacyBroadcastExpiry(broadcast: NotificationState['broadcasts'][number]) {
  if (broadcast.expiresAt || !/^dnes\b/iu.test(broadcast.validUntil)) return broadcast.expiresAt

  const createdAt = Date.parse(broadcast.createdAt)
  if (!Number.isFinite(createdAt)) return undefined

  return new Date(createdAt + 24 * 60 * 60 * 1000).toISOString()
}

function migrateLegacyNotificationCopy(state: NotificationState): NotificationState {
  const broadcasts = state.broadcasts.map((broadcast) => ({
    ...broadcast,
    expiresAt: inferLegacyBroadcastExpiry(broadcast),
    message: normalizeLegacyNotificationMessage(broadcast.message),
    validUntil: normalizeLegacyValidUntil(broadcast.validUntil),
  }))
  const broadcastByAlertId = new Map(broadcasts.map((broadcast) => [broadcast.alertId, broadcast]))

  return {
    ...state,
    alerts: state.alerts.map((alert) => {
      const broadcast = broadcastByAlertId.get(alert.id)

      return {
        ...alert,
        createdAt: alert.createdAt ?? broadcast?.createdAt,
        endedAt: alert.endedAt ?? broadcast?.endedAt,
        expiresAt: alert.expiresAt ?? broadcast?.expiresAt,
        validUntil: normalizeLegacyValidUntil(alert.validUntil),
      }
    }),
    broadcasts,
    deliveryLogs: state.deliveryLogs.map((delivery) => ({
      ...delivery,
      message: normalizeLegacyNotificationMessage(delivery.message),
    })),
  }
}

export async function readLocalNotificationState(
  filePath = resolveLocalNotificationStorePath(),
): Promise<LocalNotificationState> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)

    if (isNotificationState(parsed)) {
      const migratedState = migrateLegacyNotificationCopy({
        alerts: parsed.alerts,
        broadcasts: parsed.broadcasts ?? [],
        deliveryLogs: parsed.deliveryLogs ?? [],
        subscriptions: parsed.subscriptions ?? [],
      })

      return {
        ...cloneNotificationState(migratedState),
        updatedAt: parsed.updatedAt,
        version: 1,
      }
    }
  }
  catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException
    if (maybeNodeError.code !== 'ENOENT') {
      console.warn(`Nepodarilo sa načítať lokálne notifikácie: ${maybeNodeError.message}`)
    }
  }

  const seedState = createSeedNotificationState()
  await writeLocalNotificationState(seedState, filePath)

  return seedState
}

export async function writeLocalNotificationState(
  state: NotificationState,
  filePath = resolveLocalNotificationStorePath(),
): Promise<LocalNotificationState> {
  const nextState: LocalNotificationState = {
    ...cloneNotificationState(state),
    updatedAt: new Date().toISOString(),
    version: 1,
  }

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8')

  return nextState
}
