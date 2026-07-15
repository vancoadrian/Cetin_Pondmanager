import type { PushSubscriptionPermission } from '~/data/pond'

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
