import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, createRouter, toNodeListener } from 'h3'
import type { Alert, NotificationBroadcast, NotificationDeliveryLog, PushSubscriptionRecord } from '~/app/data/pond'
import type {
  PublicNotificationStateResponse,
  PushSubscriptionMutationSuccess,
  PushUnsubscribeSuccess,
} from '~/app/services/notificationService'
import notificationsGetHandler from '~/server/api/notifications.get'
import notificationSubscribeHandler from '~/server/api/notifications/subscribe.post'
import notificationUnsubscribeHandler from '~/server/api/notifications/unsubscribe.post'
import { readLocalNotificationState, writeLocalNotificationState } from '~/server/utils/localNotificationStore'

const localEnvKeys = [
  'RYBOLOV_LOCAL_NOTIFICATION_STORE',
] as const

const originalEnv = new Map<string, string | undefined>()
let tempDir: string | undefined

interface TestRouteServer {
  baseUrl: string
  close: () => Promise<void>
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'rybolov-notification-public-'))

  for (const key of localEnvKeys) {
    if (!originalEnv.has(key)) {
      originalEnv.set(key, process.env[key])
    }
  }

  process.env.RYBOLOV_LOCAL_NOTIFICATION_STORE = join(tempDir, 'notification-state.json')
})

afterEach(async () => {
  for (const key of localEnvKeys) {
    const original = originalEnv.get(key)

    if (original === undefined) {
      Reflect.deleteProperty(process.env, key)
    }
    else {
      process.env[key] = original
    }
  }

  if (tempDir) {
    await rm(tempDir, { force: true, recursive: true })
    tempDir = undefined
  }
})

function createNotificationRouteServerApp() {
  const app = createApp()
  const router = createRouter()

  router.get('/api/notifications', notificationsGetHandler)
  router.post('/api/notifications/subscribe', notificationSubscribeHandler)
  router.post('/api/notifications/unsubscribe', notificationUnsubscribeHandler)
  app.use(router.handler)

  return app
}

async function startRouteServer(): Promise<TestRouteServer> {
  const server = createServer(toNodeListener(createNotificationRouteServerApp()))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Testovací HTTP server nemá dostupný port.')
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  }
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

async function requestJson<T>(
  server: TestRouteServer,
  path: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')

  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const response = await fetch(`${server.baseUrl}${path}`, {
    ...init,
    headers,
  })
  const raw = await response.text()
  const body = raw ? JSON.parse(raw) as T : null

  return {
    body,
    raw,
    response,
  }
}

function alertFixture(overrides: Partial<Alert> = {}): Alert {
  return {
    body: 'O 18:30 sa očakáva prechod búrkového pásma.',
    createdAt: '2026-05-20T12:05:00.000Z',
    expiresAt: '2099-05-20T21:00:00.000Z',
    id: 'alert-public-storm',
    severity: 'storm',
    title: 'Výstraha pred búrkou',
    validUntil: 'dnes 21:00',
    ...overrides,
  }
}

function subscriptionFixture(overrides: Partial<PushSubscriptionRecord> = {}): PushSubscriptionRecord {
  return {
    createdAt: '2026-05-20T12:00:00.000Z',
    deviceLabel: 'Rybárov mobil',
    enabled: true,
    endpoint: 'mock://rybolov-cetin/public-device',
    id: 'push-public-device',
    lastSeenAt: '2026-05-20T12:00:00.000Z',
    permission: 'granted',
    topics: ['weather', 'service'],
    updatedAt: '2026-05-20T12:00:00.000Z',
    userAgent: 'Vitest public',
    ...overrides,
  }
}

function broadcastFixture(overrides: Partial<NotificationBroadcast> = {}): NotificationBroadcast {
  return {
    alertId: 'alert-public-storm',
    body: 'O 18:30 sa očakáva prechod búrkového pásma.',
    createdAt: '2026-05-20T12:05:00.000Z',
    createdBy: 'Správca',
    expiresAt: '2099-05-20T21:00:00.000Z',
    id: 'broadcast-public-storm',
    message: 'Skúšobné doručovanie zaevidovalo 1 doručení.',
    recipientCount: 1,
    severity: 'storm',
    status: 'sent',
    targetTopics: ['weather'],
    title: 'Výstraha pred búrkou',
    validUntil: 'dnes 21:00',
    ...overrides,
  }
}

function deliveryLogFixture(overrides: Partial<NotificationDeliveryLog> = {}): NotificationDeliveryLog {
  return {
    attemptedAt: '2026-05-20T12:06:00.000Z',
    broadcastId: 'broadcast-public-storm',
    deviceLabel: 'Rybárov mobil',
    endpoint: 'mock://rybolov-cetin/public-device',
    id: 'delivery-public-device',
    message: 'Skúšobné doručovanie označilo notifikáciu ako doručenú.',
    provider: 'mock',
    status: 'sent',
    subscriptionId: 'push-public-device',
    ...overrides,
  }
}

describe('public notification API routes', () => {
  it('returns only public alerts and active subscription count', async () => {
    await writeLocalNotificationState({
      alerts: [alertFixture()],
      broadcasts: [broadcastFixture()],
      deliveryLogs: [deliveryLogFixture()],
      subscriptions: [
        subscriptionFixture(),
        subscriptionFixture({
          enabled: false,
          endpoint: 'mock://rybolov-cetin/disabled-device',
          id: 'push-disabled-device',
          permission: 'denied',
        }),
      ],
    })
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<PublicNotificationStateResponse>(
        server,
        '/api/notifications',
      )

      expect(response.status).toBe(200)
      expect(body).toMatchObject({
        ok: true,
        subscriptionCount: 1,
      })
      expect(body?.alerts).toEqual([alertFixture()])
      expect(body).not.toHaveProperty('broadcasts')
      expect(body).not.toHaveProperty('deliveryLogs')
      expect(body).not.toHaveProperty('subscriptions')
    }
    finally {
      await server.close()
    }
  })

  it('omits expired and manually ended alerts from the public response', async () => {
    await writeLocalNotificationState({
      alerts: [
        alertFixture({ id: 'alert-active', title: 'Aktívna výstraha' }),
        alertFixture({
          expiresAt: '2026-05-20T13:00:00.000Z',
          id: 'alert-expired',
          title: 'Stará výstraha',
        }),
        alertFixture({
          endedAt: '2026-05-20T13:00:00.000Z',
          id: 'alert-ended',
          title: 'Ukončená výstraha',
        }),
      ],
      broadcasts: [],
      deliveryLogs: [],
      subscriptions: [],
    })
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<PublicNotificationStateResponse>(
        server,
        '/api/notifications',
      )

      expect(response.status).toBe(200)
      expect(body?.alerts.map((alert) => alert.id)).toEqual(['alert-active'])
    }
    finally {
      await server.close()
    }
  })

  it('stores a public subscription and strips internal audience scope', async () => {
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<PushSubscriptionMutationSuccess>(
        server,
        '/api/notifications/subscribe',
        {
          body: JSON.stringify({
            audienceRole: 'marshal',
            deviceLabel: 'Mobil pri vode',
            endpoint: 'mock://rybolov-cetin/public-device',
            lakeIds: ['strkovisko-kocka'],
            marshalId: 'marshal-1',
            permission: 'granted',
            sectorIds: ['a2'],
            topics: ['weather', 'tournaments'],
            tournamentIds: ['eccj-2026'],
            userAgent: 'Safari PWA',
          }),
          method: 'POST',
        },
      )

      expect(response.status).toBe(201)
      expect(body?.subscription).toMatchObject({
        deviceLabel: 'Mobil pri vode',
        enabled: true,
        endpoint: 'mock://rybolov-cetin/public-device',
        lakeIds: ['strkovisko-kocka'],
        topics: ['weather', 'tournaments'],
      })
      expect(body?.subscription.audienceRole).toBeUndefined()
      expect(body?.subscription.marshalId).toBeUndefined()
      expect(body?.subscription.sectorIds).toEqual([])
      expect(body?.subscription.tournamentIds).toEqual([])

      const state = await readLocalNotificationState()
      expect(state.subscriptions[0]).toMatchObject({
        endpoint: 'mock://rybolov-cetin/public-device',
        lakeIds: ['strkovisko-kocka'],
        topics: ['weather', 'tournaments'],
      })
      expect(state.subscriptions[0]?.audienceRole).toBeUndefined()
      expect(state.subscriptions[0]?.sectorIds).toEqual([])
    }
    finally {
      await server.close()
    }
  })

  it('updates an existing public subscription by endpoint', async () => {
    await writeLocalNotificationState({
      alerts: [],
      broadcasts: [],
      deliveryLogs: [],
      subscriptions: [subscriptionFixture()],
    })
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<PushSubscriptionMutationSuccess>(
        server,
        '/api/notifications/subscribe',
        {
          body: JSON.stringify({
            deviceLabel: 'Tablet v bivaku',
            endpoint: 'mock://rybolov-cetin/public-device',
            permission: 'granted',
            topics: ['reservations'],
            userAgent: 'Chrome PWA',
          }),
          method: 'POST',
        },
      )

      expect(response.status).toBe(200)
      expect(body?.subscription).toMatchObject({
        deviceLabel: 'Tablet v bivaku',
        id: 'push-public-device',
        topics: ['reservations'],
      })
      expect(body?.subscriptions).toHaveLength(1)
    }
    finally {
      await server.close()
    }
  })

  it('rejects invalid public subscription payloads', async () => {
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<{ data: { messages: string[] }, statusMessage: string }>(
        server,
        '/api/notifications/subscribe',
        {
          body: JSON.stringify({
            endpoint: 'short',
            permission: 'granted',
            topics: [],
          }),
          method: 'POST',
        },
      )

      expect(response.status).toBe(422)
      expect(body?.statusMessage).toBe('Push subscription validation failed')
      expect(body?.data.messages).toContain('Chýba endpoint odberu notifikácií.')
    }
    finally {
      await server.close()
    }
  })

  it('unsubscribes an existing public subscription by endpoint', async () => {
    await writeLocalNotificationState({
      alerts: [alertFixture()],
      broadcasts: [broadcastFixture()],
      deliveryLogs: [deliveryLogFixture()],
      subscriptions: [subscriptionFixture()],
    })
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<PushUnsubscribeSuccess>(
        server,
        '/api/notifications/unsubscribe',
        {
          body: JSON.stringify({
            endpoint: 'mock://rybolov-cetin/public-device',
          }),
          method: 'POST',
        },
      )

      expect(response.status).toBe(200)
      expect(body?.subscription).toMatchObject({
        enabled: false,
        id: 'push-public-device',
        permission: 'denied',
      })

      const state = await readLocalNotificationState()
      expect(state.subscriptions[0]?.enabled).toBe(false)
      expect(state.alerts).toHaveLength(1)
      expect(state.broadcasts).toHaveLength(1)
      expect(state.deliveryLogs).toHaveLength(1)
    }
    finally {
      await server.close()
    }
  })

  it('returns 404 when unsubscribe endpoint is unknown', async () => {
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<{ data: { messages: string[] }, statusMessage: string }>(
        server,
        '/api/notifications/unsubscribe',
        {
          body: JSON.stringify({
            endpoint: 'mock://rybolov-cetin/missing-device',
          }),
          method: 'POST',
        },
      )

      expect(response.status).toBe(404)
      expect(body?.statusMessage).toBe('Push unsubscribe validation failed')
      expect(body?.data.messages).toContain('Odber notifikácií sa nenašiel.')
    }
    finally {
      await server.close()
    }
  })
})
