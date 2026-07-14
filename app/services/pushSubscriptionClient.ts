import type { LakeSlug, PushSubscriptionPermission, PushSubscriptionTopic } from '~/data/pond'

export const PUSH_ENDPOINT_STORAGE_KEY = 'rybolov_cetin_push_endpoint'
export const MOCK_PUSH_ENDPOINT_STORAGE_KEY = 'rybolov_cetin_mock_push_endpoint'
export const PUSH_PREFERENCES_STORAGE_KEY = 'rybolov_cetin_push_preferences'
export const DEFAULT_PUBLIC_PUSH_TOPICS: PushSubscriptionTopic[] = [
  'weather',
  'service',
  'reservations',
  'tournaments',
]
export const DEFAULT_PUBLIC_PUSH_LAKES: LakeSlug[] = ['velky-cetin', 'strkovisko-kocka']

export interface PublicPushPreferences {
  lakeIds: LakeSlug[]
  topics: PushSubscriptionTopic[]
}

export type ClientPushMode = 'mock' | 'web-push'
export type ClientPushSupportReason =
  | 'missing-notification'
  | 'missing-push-manager'
  | 'missing-service-worker'
  | 'missing-vapid-public-key'
  | 'ready'

export interface ClientPushSupport {
  mode: ClientPushMode
  reason: ClientPushSupportReason
}

export interface ClientPushSupportInput {
  hasNotification: boolean
  hasPushManager: boolean
  hasServiceWorker: boolean
  vapidPublicKey?: string
}

export interface ClientPushSubscriptionPayload {
  auth?: string
  endpoint: string
  p256dh?: string
  permission: PushSubscriptionPermission
}

export interface ClientPushSubscriptionJson {
  keys?: {
    auth?: string
    p256dh?: string
  }
}

export interface ClientPushSubscription {
  endpoint: string
  toJSON: () => ClientPushSubscriptionJson
}

function normalizeSelection<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  fallback: readonly T[],
) {
  if (!Array.isArray(value)) return [...fallback]

  const allowed = new Set<string>(allowedValues)
  const selected = [...new Set(value.filter((item): item is T =>
    typeof item === 'string' && allowed.has(item),
  ))]

  return selected.length > 0 ? selected : [...fallback]
}

export function readPublicPushPreferences(
  storage: Pick<Storage, 'getItem'>,
): PublicPushPreferences {
  try {
    const raw = storage.getItem(PUSH_PREFERENCES_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) as Partial<PublicPushPreferences> : undefined

    return {
      lakeIds: normalizeSelection(parsed?.lakeIds, DEFAULT_PUBLIC_PUSH_LAKES, DEFAULT_PUBLIC_PUSH_LAKES),
      topics: normalizeSelection(parsed?.topics, DEFAULT_PUBLIC_PUSH_TOPICS, DEFAULT_PUBLIC_PUSH_TOPICS),
    }
  }
  catch {
    return {
      lakeIds: [...DEFAULT_PUBLIC_PUSH_LAKES],
      topics: [...DEFAULT_PUBLIC_PUSH_TOPICS],
    }
  }
}

export function writePublicPushPreferences(
  storage: Pick<Storage, 'setItem'>,
  preferences: PublicPushPreferences,
) {
  const normalized = {
    lakeIds: normalizeSelection(preferences.lakeIds, DEFAULT_PUBLIC_PUSH_LAKES, DEFAULT_PUBLIC_PUSH_LAKES),
    topics: normalizeSelection(preferences.topics, DEFAULT_PUBLIC_PUSH_TOPICS, DEFAULT_PUBLIC_PUSH_TOPICS),
  }

  storage.setItem(PUSH_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized))

  return normalized
}

export function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = globalThis.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index)
  }

  return outputArray
}

export function getClientPushSupport(input: ClientPushSupportInput): ClientPushSupport {
  if (!input.hasNotification) {
    return {
      mode: 'mock',
      reason: 'missing-notification',
    }
  }

  if (!input.hasServiceWorker) {
    return {
      mode: 'mock',
      reason: 'missing-service-worker',
    }
  }

  if (!input.hasPushManager) {
    return {
      mode: 'mock',
      reason: 'missing-push-manager',
    }
  }

  if (!input.vapidPublicKey?.trim()) {
    return {
      mode: 'mock',
      reason: 'missing-vapid-public-key',
    }
  }

  return {
    mode: 'web-push',
    reason: 'ready',
  }
}

export function createMockPushEndpoint(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  randomUUID: () => string,
) {
  const existingEndpoint = storage.getItem(MOCK_PUSH_ENDPOINT_STORAGE_KEY)
  if (existingEndpoint) return existingEndpoint

  const endpoint = `mock://rybolov-cetin/${randomUUID()}`
  storage.setItem(MOCK_PUSH_ENDPOINT_STORAGE_KEY, endpoint)

  return endpoint
}

export function createMockPushSubscriptionPayload(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  permission: PushSubscriptionPermission,
  randomUUID: () => string,
): ClientPushSubscriptionPayload {
  return {
    auth: 'mock-auth',
    endpoint: createMockPushEndpoint(storage, randomUUID),
    p256dh: 'mock-p256dh',
    permission,
  }
}

export function createWebPushSubscribeOptions(vapidPublicKey: string): PushSubscriptionOptionsInit {
  return {
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    userVisibleOnly: true,
  }
}

export function createWebPushSubscriptionPayload(
  subscription: ClientPushSubscription,
  permission: PushSubscriptionPermission,
): ClientPushSubscriptionPayload {
  const payload = subscription.toJSON()

  return {
    auth: payload.keys?.auth,
    endpoint: subscription.endpoint,
    p256dh: payload.keys?.p256dh,
    permission,
  }
}
