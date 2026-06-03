import type { PushSubscriptionPermission } from '~/data/pond'

export const PUSH_ENDPOINT_STORAGE_KEY = 'rybolov_cetin_push_endpoint'
export const MOCK_PUSH_ENDPOINT_STORAGE_KEY = 'rybolov_cetin_mock_push_endpoint'

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
