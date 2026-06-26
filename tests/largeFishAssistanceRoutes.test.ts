import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, createRouter, toNodeListener } from 'h3'
import type {
  LargeFishAssistanceMutationSuccess,
  LargeFishAssistancePublicResponse,
  LargeFishAssistanceStateResponse,
} from '~/app/services/largeFishAssistanceService'
import adminAssistanceGetHandler from '~/server/api/admin/large-fish-assistance.get'
import adminAssistanceRespondHandler from '~/server/api/admin/large-fish-assistance/[id]/respond.post'
import fishPresencePostHandler from '~/server/api/admin/fish-registry/presence.post'
import assistancePostHandler from '~/server/api/large-fish-assistance.post'
import assistanceGetHandler from '~/server/api/large-fish-assistance/[id].get'
import assistanceCancelHandler from '~/server/api/large-fish-assistance/[id]/cancel.post'
import { readLocalAuditLogState } from '~/server/utils/localAuditLogStore'
import { readLocalNotificationState, writeLocalNotificationState } from '~/server/utils/localNotificationStore'

const MANAGER_COOKIE = 'rybolov_cetin_mock_session=manager'
const localEnvKeys = [
  'RYBOLOV_LOCAL_AUDIT_LOG_STORE',
  'RYBOLOV_LOCAL_FISH_REGISTRY_STORE',
  'RYBOLOV_LOCAL_LARGE_FISH_ASSISTANCE_STORE',
  'RYBOLOV_LOCAL_MAP_STORE',
  'RYBOLOV_LOCAL_NOTIFICATION_STORE',
] as const
const originalEnv = new Map<string, string | undefined>()
let tempDir: string | undefined

interface TestServer {
  baseUrl: string
  close: () => Promise<void>
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'rybolov-large-fish-routes-'))
  const dataDir = join(tempDir, 'data')

  for (const key of localEnvKeys) {
    if (!originalEnv.has(key)) originalEnv.set(key, process.env[key])
  }

  process.env.RYBOLOV_LOCAL_AUDIT_LOG_STORE = join(dataDir, 'audit.json')
  process.env.RYBOLOV_LOCAL_FISH_REGISTRY_STORE = join(dataDir, 'fish.json')
  process.env.RYBOLOV_LOCAL_LARGE_FISH_ASSISTANCE_STORE = join(dataDir, 'assistance.json')
  process.env.RYBOLOV_LOCAL_MAP_STORE = join(dataDir, 'map.json')
  process.env.RYBOLOV_LOCAL_NOTIFICATION_STORE = join(dataDir, 'notifications.json')

  const now = '2026-06-22T12:00:00.000Z'
  await writeLocalNotificationState({
    alerts: [],
    broadcasts: [],
    deliveryLogs: [],
    subscriptions: [{
      audienceRole: 'manager',
      createdAt: now,
      deviceLabel: 'Správca - mobil',
      enabled: true,
      endpoint: 'mock://manager-device',
      id: 'push-manager',
      lastSeenAt: now,
      permission: 'granted',
      topics: ['service'],
      updatedAt: now,
      userAgent: 'Vitest',
    }],
  })
})

afterEach(async () => {
  for (const key of localEnvKeys) {
    const original = originalEnv.get(key)
    if (original === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = original
  }

  if (tempDir) {
    await rm(tempDir, { force: true, recursive: true })
    tempDir = undefined
  }
})

function createRouteApp() {
  const app = createApp()
  const router = createRouter()
  router.post('/api/large-fish-assistance', assistancePostHandler)
  router.get('/api/large-fish-assistance/:id', assistanceGetHandler)
  router.post('/api/large-fish-assistance/:id/cancel', assistanceCancelHandler)
  router.get('/api/admin/large-fish-assistance', adminAssistanceGetHandler)
  router.post('/api/admin/large-fish-assistance/:id/respond', adminAssistanceRespondHandler)
  router.post('/api/admin/fish-registry/presence', fishPresencePostHandler)
  app.use(router.handler)
  return app
}

async function activateManagerPresence(server: TestServer) {
  const response = await requestJson(
    server,
    '/api/admin/fish-registry/presence',
    {
      body: JSON.stringify({
        action: 'start',
        durationHours: 12,
        lakes: ['velky-cetin'],
      }),
      method: 'POST',
    },
  )
  expect(response.response.status).toBe(200)
}

async function startServer(): Promise<TestServer> {
  const server = createServer(toNodeListener(createRouteApp()))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server has no port.')

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    }),
  }
}

async function requestJson<T>(
  server: TestServer,
  path: string,
  init: RequestInit & { cookie?: string | null } = {},
) {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  if (init.body) headers.set('content-type', 'application/json')
  if (init.cookie !== null) headers.set('cookie', init.cookie ?? MANAGER_COOKIE)

  const response = await fetch(`${server.baseUrl}${path}`, { ...init, headers })
  const body = JSON.parse(await response.text()) as T
  return { body, response }
}

describe('large fish assistance routes', () => {
  it('notifies the manager, accepts ETA and exposes the response only with the public token', async () => {
    const server = await startServer()

    try {
      await activateManagerPresence(server)
      const submission = await requestJson<LargeFishAssistanceMutationSuccess>(
        server,
        '/api/large-fish-assistance',
        {
          body: JSON.stringify({
            anglerName: 'Marek H.',
            caughtAt: '2026-06-22T12:05:00.000Z',
            lake: 'velky-cetin',
            lengthCm: 101,
            note: '',
            pegId: 'vc-03',
            phone: '+421 900 111 222',
            species: 'Kapor',
            weightKg: 21.4,
          }),
          cookie: null,
          method: 'POST',
        },
      )
      expect(submission.response.status).toBe(201)
      expect(submission.body.request.status).toBe('waiting')

      const request = submission.body.request
      const invalidRead = await requestJson(
        server,
        `/api/large-fish-assistance/${request.id}?token=wrong`,
        { cookie: null },
      )
      expect(invalidRead.response.status).toBe(404)

      const adminState = await requestJson<LargeFishAssistanceStateResponse>(
        server,
        '/api/admin/large-fish-assistance',
      )
      expect(adminState.body.requests[0]?.id).toBe(request.id)

      const response = await requestJson<LargeFishAssistanceMutationSuccess>(
        server,
        `/api/admin/large-fish-assistance/${request.id}/respond`,
        {
          body: JSON.stringify({
            action: 'on-route',
            etaMinutes: 15,
            responseMessage: '',
          }),
          method: 'POST',
        },
      )
      expect(response.body.request).toMatchObject({
        etaMinutes: 15,
        status: 'on-route',
      })

      const publicState = await requestJson<LargeFishAssistancePublicResponse>(
        server,
        `/api/large-fish-assistance/${request.id}?token=${request.publicToken}`,
        { cookie: null },
      )
      expect(publicState.body.request.responseMessage).toContain('15 min')

      const completed = await requestJson<LargeFishAssistanceMutationSuccess>(
        server,
        `/api/admin/large-fish-assistance/${request.id}/respond`,
        {
          body: JSON.stringify({
            action: 'completed',
            responseMessage: 'Kontrola ryby a zápis čipu boli dokončené.',
          }),
          method: 'POST',
        },
      )
      expect(completed.body.request.status).toBe('completed')

      const completedAdminState = await requestJson<LargeFishAssistanceStateResponse>(
        server,
        '/api/admin/large-fish-assistance',
      )
      expect(completedAdminState.body.requests.find((item) => item.id === request.id)?.status).toBe('completed')

      const notifications = await readLocalNotificationState()
      expect(notifications.broadcasts[0]).toMatchObject({
        recipientCount: 1,
        targetAudience: { requestId: request.id },
      })
      expect(notifications.alerts).toEqual([])

      const audit = await readLocalAuditLogState()
      expect(audit.events.some((event) => event.action === 'fish.assistance.requested')).toBe(true)
      expect(audit.events.some((event) => event.action === 'fish.assistance.on-route')).toBe(true)
      expect(audit.events.some((event) => event.action === 'fish.assistance.completed')).toBe(true)
    }
    finally {
      await server.close()
    }
  })

  it('allows the angler to cancel with the private token and rejects another token', async () => {
    const server = await startServer()

    try {
      await activateManagerPresence(server)
      const submission = await requestJson<LargeFishAssistanceMutationSuccess>(
        server,
        '/api/large-fish-assistance',
        {
          body: JSON.stringify({
            anglerName: 'Cancel tester',
            caughtAt: '2026-06-22T12:05:00.000Z',
            lake: 'velky-cetin',
            lengthCm: 101,
            note: '',
            pegId: 'vc-04',
            phone: '+421 900 333 444',
            species: 'Kapor',
            weightKg: 20.2,
          }),
          cookie: null,
          method: 'POST',
        },
      )
      const request = submission.body.request

      const rejected = await requestJson(
        server,
        `/api/large-fish-assistance/${request.id}/cancel`,
        {
          body: JSON.stringify({ token: 'wrong' }),
          cookie: null,
          method: 'POST',
        },
      )
      expect(rejected.response.status).toBe(404)

      const cancelled = await requestJson<LargeFishAssistanceMutationSuccess>(
        server,
        `/api/large-fish-assistance/${request.id}/cancel`,
        {
          body: JSON.stringify({ token: request.publicToken }),
          cookie: null,
          method: 'POST',
        },
      )
      expect(cancelled.body.request.status).toBe('cancelled')
    }
    finally {
      await server.close()
    }
  })
})
