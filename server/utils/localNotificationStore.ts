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
    (candidate.subscriptions === undefined || Array.isArray(candidate.subscriptions))
  )
}

export async function readLocalNotificationState(
  filePath = resolveLocalNotificationStorePath(),
): Promise<LocalNotificationState> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)

    if (isNotificationState(parsed)) {
      return {
        ...cloneNotificationState({
          alerts: parsed.alerts,
          broadcasts: parsed.broadcasts ?? [],
          subscriptions: parsed.subscriptions ?? [],
        }),
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
