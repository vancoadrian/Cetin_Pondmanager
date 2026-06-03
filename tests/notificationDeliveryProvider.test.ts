import { afterEach, describe, expect, it } from 'vitest'
import {
  createNotificationDeliveryDiagnostics,
  resolveNotificationDeliveryOptions,
} from '~/server/utils/notificationDeliveryProvider'

const envKeys = [
  'NUXT_PUBLIC_VAPID_PUBLIC_KEY',
  'RYBOLOV_PUSH_PROVIDER',
  'RYBOLOV_PUSH_SUBJECT',
  'RYBOLOV_PUSH_TIMEOUT_MS',
  'RYBOLOV_PUSH_TTL_SECONDS',
  'RYBOLOV_PUSH_URGENCY',
  'RYBOLOV_VAPID_PRIVATE_KEY',
] as const
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]))

function clearPushEnv() {
  for (const key of envKeys) {
    Reflect.deleteProperty(process.env, key)
  }
}

function restorePushEnv() {
  for (const key of envKeys) {
    const originalValue = originalEnv.get(key)
    if (originalValue === undefined) {
      Reflect.deleteProperty(process.env, key)
    }
    else {
      process.env[key] = originalValue
    }
  }
}

afterEach(() => {
  restorePushEnv()
})

describe('notificationDeliveryProvider', () => {
  it('defaults to mock provider and reports missing VAPID config', () => {
    clearPushEnv()

    const options = resolveNotificationDeliveryOptions('2026-05-20T12:00:00.000Z')
    const diagnostics = createNotificationDeliveryDiagnostics(options)

    expect(options).toMatchObject({
      hasVapidConfig: false,
      now: '2026-05-20T12:00:00.000Z',
      provider: 'mock',
      timeoutMs: 10_000,
      ttlSeconds: 3600,
      urgency: 'normal',
    })
    expect(diagnostics).toMatchObject({
      hasVapidConfig: false,
      missingConfigKeys: [
        'NUXT_PUBLIC_VAPID_PUBLIC_KEY',
        'RYBOLOV_VAPID_PRIVATE_KEY',
        'RYBOLOV_PUSH_SUBJECT',
      ],
      provider: 'mock',
      webPushReady: false,
    })
  })

  it('marks web-push as ready when provider and VAPID settings are complete', () => {
    clearPushEnv()
    process.env.NUXT_PUBLIC_VAPID_PUBLIC_KEY = 'public-key'
    process.env.RYBOLOV_PUSH_PROVIDER = 'web-push'
    process.env.RYBOLOV_PUSH_SUBJECT = 'mailto:spravca@example.test'
    process.env.RYBOLOV_PUSH_TIMEOUT_MS = '7000'
    process.env.RYBOLOV_PUSH_TTL_SECONDS = '1800'
    process.env.RYBOLOV_PUSH_URGENCY = 'high'
    process.env.RYBOLOV_VAPID_PRIVATE_KEY = 'private-key'

    const diagnostics = createNotificationDeliveryDiagnostics(resolveNotificationDeliveryOptions())

    expect(diagnostics).toMatchObject({
      hasVapidConfig: true,
      missingConfigKeys: [],
      provider: 'web-push',
      subject: 'mailto:spravca@example.test',
      timeoutMs: 7000,
      ttlSeconds: 1800,
      urgency: 'high',
      webPushReady: true,
    })
  })

  it('falls back to safe defaults for unsupported provider options', () => {
    clearPushEnv()
    process.env.RYBOLOV_PUSH_PROVIDER = 'smtp'
    process.env.RYBOLOV_PUSH_TIMEOUT_MS = '-1'
    process.env.RYBOLOV_PUSH_TTL_SECONDS = 'not-a-number'
    process.env.RYBOLOV_PUSH_URGENCY = 'urgent'

    const options = resolveNotificationDeliveryOptions()

    expect(options).toMatchObject({
      provider: 'mock',
      timeoutMs: 10_000,
      ttlSeconds: 3600,
      urgency: 'normal',
    })
  })
})
