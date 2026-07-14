import { describe, expect, it } from 'vitest'
import {
  createMockPushEndpoint,
  createMockPushSubscriptionPayload,
  createWebPushSubscribeOptions,
  createWebPushSubscriptionPayload,
  DEFAULT_PUBLIC_PUSH_LAKES,
  DEFAULT_PUBLIC_PUSH_TOPICS,
  getClientPushSupport,
  MOCK_PUSH_ENDPOINT_STORAGE_KEY,
  PUSH_PREFERENCES_STORAGE_KEY,
  readPublicPushPreferences,
  urlBase64ToUint8Array,
  writePublicPushPreferences,
} from '~/app/services/pushSubscriptionClient'

class MemoryStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

describe('pushSubscriptionClient', () => {
  it('detects whether the browser can create a real Web Push endpoint', () => {
    expect(getClientPushSupport({
      hasNotification: true,
      hasPushManager: true,
      hasServiceWorker: true,
      vapidPublicKey: 'public-key',
    })).toEqual({
      mode: 'web-push',
      reason: 'ready',
    })

    expect(getClientPushSupport({
      hasNotification: true,
      hasPushManager: true,
      hasServiceWorker: true,
      vapidPublicKey: '',
    })).toEqual({
      mode: 'mock',
      reason: 'missing-vapid-public-key',
    })

    expect(getClientPushSupport({
      hasNotification: true,
      hasPushManager: false,
      hasServiceWorker: true,
      vapidPublicKey: 'public-key',
    })).toEqual({
      mode: 'mock',
      reason: 'missing-push-manager',
    })
  })

  it('decodes URL-safe base64 into a Uint8Array for PushManager.subscribe', () => {
    expect([...urlBase64ToUint8Array('AQID')]).toEqual([1, 2, 3])

    const options = createWebPushSubscribeOptions('AQID')
    expect(options.userVisibleOnly).toBe(true)
    expect([...(options.applicationServerKey as Uint8Array)]).toEqual([1, 2, 3])
  })

  it('persists and reuses the mock endpoint for prototype subscriptions', () => {
    const storage = new MemoryStorage()
    const endpoint = createMockPushEndpoint(storage, () => 'device-1')
    const secondEndpoint = createMockPushEndpoint(storage, () => 'device-2')

    expect(endpoint).toBe('mock://rybolov-cetin/device-1')
    expect(secondEndpoint).toBe(endpoint)
    expect(storage.getItem(MOCK_PUSH_ENDPOINT_STORAGE_KEY)).toBe(endpoint)

    expect(createMockPushSubscriptionPayload(storage, 'granted', () => 'device-3')).toMatchObject({
      auth: 'mock-auth',
      endpoint,
      permission: 'granted',
      p256dh: 'mock-p256dh',
    })
  })

  it('creates server payload from a real browser PushSubscription', () => {
    const payload = createWebPushSubscriptionPayload({
      endpoint: 'https://push.example.test/device',
      toJSON: () => ({
        keys: {
          auth: 'auth-secret',
          p256dh: 'p256dh-key',
        },
      }),
    }, 'granted')

    expect(payload).toEqual({
      auth: 'auth-secret',
      endpoint: 'https://push.example.test/device',
      p256dh: 'p256dh-key',
      permission: 'granted',
    })
  })

  it('stores validated public topic and lake preferences for one device', () => {
    const storage = new MemoryStorage()

    expect(readPublicPushPreferences(storage)).toEqual({
      lakeIds: DEFAULT_PUBLIC_PUSH_LAKES,
      topics: DEFAULT_PUBLIC_PUSH_TOPICS,
    })

    const saved = writePublicPushPreferences(storage, {
      lakeIds: ['strkovisko-kocka'],
      topics: ['weather', 'reservations'],
    })

    expect(saved).toEqual({
      lakeIds: ['strkovisko-kocka'],
      topics: ['weather', 'reservations'],
    })
    expect(readPublicPushPreferences(storage)).toEqual(saved)
  })

  it('falls back to safe defaults for malformed stored preferences', () => {
    const storage = new MemoryStorage()
    storage.setItem(PUSH_PREFERENCES_STORAGE_KEY, JSON.stringify({
      lakeIds: ['unknown-lake'],
      topics: ['unknown-topic'],
    }))

    expect(readPublicPushPreferences(storage)).toEqual({
      lakeIds: DEFAULT_PUBLIC_PUSH_LAKES,
      topics: DEFAULT_PUBLIC_PUSH_TOPICS,
    })
  })
})
