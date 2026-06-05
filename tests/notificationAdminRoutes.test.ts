import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, createRouter, toNodeListener } from 'h3'
import type {
  NotificationBroadcast,
  NotificationDeliveryLog,
  PushSubscriptionRecord,
} from '~/app/data/pond'
import type {
  NotificationBroadcastSuccess,
  NotificationState,
  NotificationStateResponse,
  NotificationTestBroadcastSuccess,
  NotificationTestCleanupSuccess,
  PushSubscriptionMutationSuccess,
} from '~/app/services/notificationService'
import notificationStateHandler from '~/server/api/admin/notifications.get'
import notificationBroadcastHandler from '~/server/api/admin/notifications/broadcast.post'
import notificationSubscriptionHandler from '~/server/api/admin/notifications/subscriptions.post'
import notificationDisableSubscriptionHandler from '~/server/api/admin/notifications/subscriptions/[id]/disable.post'
import notificationTestBroadcastHandler from '~/server/api/admin/notifications/test-broadcast.post'
import notificationTestCleanupHandler from '~/server/api/admin/notifications/test-cleanup.post'
import { readLocalAuditLogState } from '~/server/utils/localAuditLogStore'
import { readLocalNotificationState, writeLocalNotificationState } from '~/server/utils/localNotificationStore'

const MANAGER_COOKIE = 'rybolov_cetin_mock_session=manager'
const ACCOUNTANT_COOKIE = 'rybolov_cetin_mock_session=accountant'

const localEnvKeys = [
  'NUXT_PUBLIC_VAPID_PUBLIC_KEY',
  'RYBOLOV_LOCAL_AUDIT_LOG_STORE',
  'RYBOLOV_LOCAL_NOTIFICATION_STORE',
  'RYBOLOV_PUSH_PROVIDER',
  'RYBOLOV_PUSH_SUBJECT',
  'RYBOLOV_PUSH_TIMEOUT_MS',
  'RYBOLOV_PUSH_TTL_SECONDS',
  'RYBOLOV_PUSH_URGENCY',
  'RYBOLOV_VAPID_PRIVATE_KEY',
] as const

const originalEnv = new Map<string, string | undefined>()
let tempDir: string | undefined

interface TestRouteServer {
  baseUrl: string
  close: () => Promise<void>
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'rybolov-notification-admin-'))

  for (const key of localEnvKeys) {
    if (!originalEnv.has(key)) {
      originalEnv.set(key, process.env[key])
    }
  }

  const dataDir = join(tempDir, 'data')
  process.env.RYBOLOV_LOCAL_AUDIT_LOG_STORE = join(dataDir, 'audit-log.json')
  process.env.RYBOLOV_LOCAL_NOTIFICATION_STORE = join(dataDir, 'notification-state.json')
  process.env.RYBOLOV_PUSH_PROVIDER = 'mock'
  process.env.RYBOLOV_PUSH_SUBJECT = 'mailto:spravca@example.test'
  process.env.RYBOLOV_PUSH_TIMEOUT_MS = '10000'
  process.env.RYBOLOV_PUSH_TTL_SECONDS = '3600'
  process.env.RYBOLOV_PUSH_URGENCY = 'normal'
  Reflect.deleteProperty(process.env, 'NUXT_PUBLIC_VAPID_PUBLIC_KEY')
  Reflect.deleteProperty(process.env, 'RYBOLOV_VAPID_PRIVATE_KEY')
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

  router.get('/api/admin/notifications', notificationStateHandler)
  router.post('/api/admin/notifications/broadcast', notificationBroadcastHandler)
  router.post('/api/admin/notifications/subscriptions', notificationSubscriptionHandler)
  router.post('/api/admin/notifications/subscriptions/:id/disable', notificationDisableSubscriptionHandler)
  router.post('/api/admin/notifications/test-broadcast', notificationTestBroadcastHandler)
  router.post('/api/admin/notifications/test-cleanup', notificationTestCleanupHandler)
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
  init: RequestInit & { cookie?: string | null } = {},
) {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')

  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  if (init.cookie !== null) {
    headers.set('cookie', init.cookie ?? MANAGER_COOKIE)
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

function subscriptionFixture(overrides: Partial<PushSubscriptionRecord> = {}): PushSubscriptionRecord {
  return {
    createdAt: '2026-05-20T12:00:00.000Z',
    deviceLabel: 'Správcov mobil',
    enabled: true,
    endpoint: 'mock://rybolov-cetin/admin-weather',
    id: 'push-admin-weather',
    lastSeenAt: '2026-05-20T12:00:00.000Z',
    permission: 'granted',
    topics: ['weather', 'service'],
    updatedAt: '2026-05-20T12:00:00.000Z',
    userAgent: 'Vitest admin',
    ...overrides,
  }
}

function publicBroadcastFixture(overrides: Partial<NotificationBroadcast> = {}): NotificationBroadcast {
  return {
    alertId: 'alert-public',
    body: 'O 18:30 sa očakáva prechod búrkového pásma.',
    createdAt: '2026-05-01T10:00:00.000Z',
    createdBy: 'Správca',
    id: 'broadcast-public',
    message: 'Mock dispatcher zaevidoval 1 doručení.',
    recipientCount: 1,
    severity: 'storm',
    status: 'sent',
    targetTopics: ['weather'],
    title: 'Verejná výstraha',
    validUntil: 'dnes 21:00',
    ...overrides,
  }
}

function testBroadcastFixture(overrides: Partial<NotificationBroadcast> = {}): NotificationBroadcast {
  return {
    alertId: 'test-old-broadcast',
    body: 'Toto je interný test doručenia notifikácie.',
    createdAt: '2026-05-01T10:00:00.000Z',
    createdBy: 'Správca',
    id: 'broadcast-test-old',
    message: 'Mock dispatcher zaevidoval 1 doručení.',
    recipientCount: 1,
    severity: 'info',
    status: 'sent',
    targetTopics: ['weather'],
    title: 'Starý test Web Push',
    validUntil: 'interný test',
    ...overrides,
  }
}

function deliveryLogFixture(overrides: Partial<NotificationDeliveryLog> = {}): NotificationDeliveryLog {
  return {
    attemptedAt: '2026-05-01T10:05:00.000Z',
    broadcastId: 'broadcast-test-old',
    deviceLabel: 'Správcov mobil',
    endpoint: 'mock://rybolov-cetin/admin-weather',
    id: 'delivery-test-old',
    message: 'Mock dispatcher označil notifikáciu ako doručenú.',
    provider: 'mock',
    status: 'sent',
    subscriptionId: 'push-admin-weather',
    ...overrides,
  }
}

async function writeNotificationStateFixture(state: Partial<NotificationState>) {
  await writeLocalNotificationState({
    alerts: state.alerts ?? [],
    broadcasts: state.broadcasts ?? [],
    deliveryLogs: state.deliveryLogs ?? [],
    subscriptions: state.subscriptions ?? [],
  })
}

describe('admin notification API routes', () => {
  it('returns internal notification state with delivery diagnostics for notification admins', async () => {
    await writeNotificationStateFixture({
      subscriptions: [subscriptionFixture()],
    })
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<NotificationStateResponse>(
        server,
        '/api/admin/notifications',
      )

      expect(response.status).toBe(200)
      expect(body?.subscriptionCount).toBe(1)
      expect(body?.deliveryDiagnostics).toMatchObject({
        provider: 'mock',
        webPushReady: false,
      })
      expect(body?.subscriptions[0]).toMatchObject({
        id: 'push-admin-weather',
        topics: ['weather', 'service'],
      })
    }
    finally {
      await server.close()
    }
  })

  it('blocks notification mutations for read-only admin roles', async () => {
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<{ statusMessage: string }>(
        server,
        '/api/admin/notifications/broadcast',
        {
          body: JSON.stringify({
            body: 'Krátka prevádzková výstraha pre ľudí pri vode.',
            severity: 'service',
            targetTopics: ['service'],
            title: 'Servisný oznam',
            validUntil: 'dnes 21:00',
          }),
          cookie: ACCOUNTANT_COOKIE,
          method: 'POST',
        },
      )

      expect(response.status).toBe(403)
      expect(body?.statusMessage).toBe('Admin access denied')
    }
    finally {
      await server.close()
    }
  })

  it('creates an admin mock subscription and writes audit metadata', async () => {
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<PushSubscriptionMutationSuccess>(
        server,
        '/api/admin/notifications/subscriptions',
        {
          body: JSON.stringify({
            audienceRole: 'marshal',
            deviceLabel: 'Kontrolór A2 mobil',
            endpoint: 'mock://rybolov-cetin/internal/marshal/eccj-2026/marshal-1/a2',
            marshalId: 'marshal-1',
            permission: 'granted',
            sectorIds: ['a2', 'a2'],
            topics: ['tournaments', 'service'],
            tournamentIds: ['eccj-2026'],
            userAgent: 'Vitest admin mock',
          }),
          method: 'POST',
        },
      )

      expect(response.status).toBe(201)
      expect(body?.subscription).toMatchObject({
        audienceRole: 'marshal',
        deviceLabel: 'Kontrolór A2 mobil',
        enabled: true,
        marshalId: 'marshal-1',
        sectorIds: ['a2'],
        topics: ['tournaments', 'service'],
        tournamentIds: ['eccj-2026'],
      })

      const state = await readLocalNotificationState()
      expect(state.subscriptions[0]?.id).toBe(body?.subscription.id)

      const audit = await readLocalAuditLogState()
      expect(audit.events[0]).toMatchObject({
        action: 'notification.subscription.mock_saved',
        actorId: 'manager',
        details: {
          audienceRole: 'marshal',
          marshalId: 'marshal-1',
          sectorIds: ['a2'],
          topics: ['tournaments', 'service'],
          tournamentIds: ['eccj-2026'],
        },
        entityId: body?.subscription.id,
      })
    }
    finally {
      await server.close()
    }
  })

  it('creates a public broadcast, sends mock delivery and stores a public alert', async () => {
    await writeNotificationStateFixture({
      subscriptions: [subscriptionFixture()],
    })
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<NotificationBroadcastSuccess>(
        server,
        '/api/admin/notifications/broadcast',
        {
          body: JSON.stringify({
            body: 'O 18:30 sa očakáva prechod búrkového pásma, skontrolujte bivaky.',
            severity: 'storm',
            targetTopics: ['weather', 'service'],
            title: 'Výstraha pred búrkou',
            validUntil: 'dnes 21:00',
          }),
          method: 'POST',
        },
      )

      expect(response.status).toBe(201)
      expect(body?.broadcast).toMatchObject({
        message: 'Mock dispatcher zaevidoval 1 doručení.',
        recipientCount: 1,
        severity: 'storm',
        status: 'sent',
      })
      expect(body?.alert.title).toBe('Výstraha pred búrkou')
      expect(body?.deliveryLogs[0]).toMatchObject({
        provider: 'mock',
        status: 'sent',
        subscriptionId: 'push-admin-weather',
      })

      const state = await readLocalNotificationState()
      expect(state.alerts[0]?.title).toBe('Výstraha pred búrkou')
      expect(state.broadcasts[0]?.status).toBe('sent')
      expect(state.deliveryLogs[0]?.status).toBe('sent')

      const audit = await readLocalAuditLogState()
      expect(audit.events[0]).toMatchObject({
        action: 'notification.broadcast.created',
        actorId: 'manager',
        details: {
          deliveryProvider: 'mock',
          recipientCount: 1,
          severity: 'storm',
          status: 'sent',
        },
        severity: 'critical',
      })
    }
    finally {
      await server.close()
    }
  })

  it('creates an internal test broadcast without a public alert', async () => {
    await writeNotificationStateFixture({
      subscriptions: [subscriptionFixture()],
    })
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<NotificationTestBroadcastSuccess>(
        server,
        '/api/admin/notifications/test-broadcast',
        {
          body: JSON.stringify({
            body: 'Toto je interný test doručenia notifikácie.',
            targetTopics: ['weather'],
            title: 'Test Web Push',
          }),
          method: 'POST',
        },
      )

      expect(response.status).toBe(201)
      expect(body?.broadcast).toMatchObject({
        alertId: expect.stringContaining('test-'),
        message: 'Mock dispatcher zaevidoval 1 doručení.',
        recipientCount: 1,
        status: 'sent',
      })
      expect(body?.deliveryLogs[0]).toMatchObject({
        provider: 'mock',
        status: 'sent',
      })

      const state = await readLocalNotificationState()
      expect(state.alerts).toEqual([])
      expect(state.broadcasts[0]?.alertId).toContain('test-')

      const audit = await readLocalAuditLogState()
      expect(audit.events[0]).toMatchObject({
        action: 'notification.broadcast.tested',
        actorId: 'manager',
        details: {
          deliveryProvider: 'mock',
          recipientCount: 1,
          status: 'sent',
        },
      })
    }
    finally {
      await server.close()
    }
  })

  it('disables a subscription by id and keeps delivery history', async () => {
    await writeNotificationStateFixture({
      deliveryLogs: [deliveryLogFixture({
        broadcastId: 'broadcast-public',
        id: 'delivery-public',
      })],
      subscriptions: [subscriptionFixture()],
    })
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<PushSubscriptionMutationSuccess>(
        server,
        '/api/admin/notifications/subscriptions/push-admin-weather/disable',
        { method: 'POST' },
      )

      expect(response.status).toBe(200)
      expect(body?.subscription).toMatchObject({
        enabled: false,
        id: 'push-admin-weather',
        permission: 'denied',
      })

      const state = await readLocalNotificationState()
      expect(state.subscriptions[0]?.enabled).toBe(false)
      expect(state.deliveryLogs).toHaveLength(1)

      const audit = await readLocalAuditLogState()
      expect(audit.events[0]).toMatchObject({
        action: 'notification.subscription.disabled',
        actorId: 'manager',
        entityId: 'push-admin-weather',
      })
    }
    finally {
      await server.close()
    }
  })

  it('cleans old internal test broadcasts and their delivery logs only', async () => {
    const oldTest = testBroadcastFixture()
    const recentTest = testBroadcastFixture({
      alertId: 'test-recent-broadcast',
      createdAt: '2026-06-04T10:00:00.000Z',
      id: 'broadcast-test-recent',
      title: 'Nový test Web Push',
    })
    const publicBroadcast = publicBroadcastFixture()
    await writeNotificationStateFixture({
      alerts: [{
        body: publicBroadcast.body,
        id: publicBroadcast.alertId,
        severity: publicBroadcast.severity,
        title: publicBroadcast.title,
        validUntil: publicBroadcast.validUntil,
      }],
      broadcasts: [recentTest, oldTest, publicBroadcast],
      deliveryLogs: [
        deliveryLogFixture(),
        deliveryLogFixture({
          broadcastId: 'broadcast-test-recent',
          id: 'delivery-test-recent',
        }),
        deliveryLogFixture({
          broadcastId: 'broadcast-public',
          id: 'delivery-public',
        }),
      ],
      subscriptions: [subscriptionFixture()],
    })
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<NotificationTestCleanupSuccess>(
        server,
        '/api/admin/notifications/test-cleanup',
        {
          body: JSON.stringify({
            keepRecentTestBroadcasts: 1,
            olderThanDays: 7,
          }),
          method: 'POST',
        },
      )

      expect(response.status).toBe(200)
      expect(body?.removedTestBroadcastCount).toBe(1)
      expect(body?.removedDeliveryLogCount).toBe(1)
      expect(body?.broadcasts.map((broadcast) => broadcast.id)).toEqual([
        'broadcast-test-recent',
        'broadcast-public',
      ])
      expect(body?.deliveryLogs.map((log) => log.id)).toEqual([
        'delivery-test-recent',
        'delivery-public',
      ])

      const state = await readLocalNotificationState()
      expect(state.broadcasts.map((broadcast) => broadcast.id)).toEqual([
        'broadcast-test-recent',
        'broadcast-public',
      ])
      expect(state.alerts.map((alert) => alert.id)).toEqual(['alert-public'])

      const audit = await readLocalAuditLogState()
      expect(audit.events[0]).toMatchObject({
        action: 'notification.tests.cleaned',
        actorId: 'manager',
        details: {
          keepRecentTestBroadcasts: 1,
          olderThanDays: 7,
          removedDeliveryLogCount: 1,
          removedTestBroadcastCount: 1,
        },
      })
    }
    finally {
      await server.close()
    }
  })
})
