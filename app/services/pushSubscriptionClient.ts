import type { Alert, LakeSlug, PushSubscriptionPermission, PushSubscriptionTopic } from '~/data/pond'
import type { ClientPushSubscriptionPayload } from '~/services/webPushSubscriptionClient'
export {
  createWebPushSubscribeOptions,
  createWebPushSubscriptionPayload,
  urlBase64ToUint8Array,
} from '~/services/webPushSubscriptionClient'
export type {
  ClientPushSubscription,
  ClientPushSubscriptionJson,
  ClientPushSubscriptionPayload,
} from '~/services/webPushSubscriptionClient'

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
export const PUBLIC_NOTIFICATION_LAKES: ReadonlyArray<{
  name: string
  slug: LakeSlug
}> = [
  {
    name: 'Veľký Cetín',
    slug: 'velky-cetin',
  },
  {
    name: 'Štrkovisko Kocka',
    slug: 'strkovisko-kocka',
  },
]
export const PUBLIC_NOTIFICATION_LAKE_LABELS: Record<LakeSlug, string> = Object.fromEntries(
  PUBLIC_NOTIFICATION_LAKES.map((lake) => [lake.slug, lake.name]),
) as Record<LakeSlug, string>
export const FALLBACK_PUBLIC_NOTIFICATION_ALERTS: Alert[] = [
  {
    body: 'O 18:30 sa očakáva prechod búrkového pásma. Skontrolujte bivaky, stojany a nepoužívajte prúty počas bleskov.',
    id: 'a-1',
    severity: 'storm',
    title: 'Výstraha pred búrkou',
    validUntil: 'dnes 21:00',
  },
  {
    body: 'Na Veľkom Cetíne môže byť horšia ovládateľnosť člnov a zavážacích lodiek pri miestach A1-A4.',
    id: 'a-2',
    severity: 'water',
    title: 'Zvýšený vietor na otvorenej vode',
    validUntil: 'dnes 20:00',
  },
  {
    body: 'Chata 10 je dočasne blokovaná. Rezervácie presúvame na najbližšie voľné miesto.',
    id: 'a-3',
    severity: 'service',
    title: 'Údržba chaty 10',
    validUntil: 'pondelka',
  },
]

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

export interface PublicNotificationDeviceState {
  lakeIds: LakeSlug[]
  permission: 'denied' | 'granted' | 'unknown' | 'unsupported'
  subscriptionEndpoint: string
  support: ClientPushSupport
  topics: PushSubscriptionTopic[]
}

export interface ClientPushSupportInput {
  hasNotification: boolean
  hasPushManager: boolean
  hasServiceWorker: boolean
  vapidPublicKey?: string
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
