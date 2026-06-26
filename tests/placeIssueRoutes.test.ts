import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, createRouter, toNodeListener } from 'h3'
import type {
  PlaceIssueActionSuccess,
  PlaceIssueStateResponse,
  PlaceIssueSubmissionSuccess,
} from '~/app/services/placeIssueService'
import adminPlaceIssueActionHandler from '~/server/api/admin/place-issues/[id]/action.post'
import adminPlaceIssuesGetHandler from '~/server/api/admin/place-issues.get'
import placeIssuesPostHandler from '~/server/api/place-issues.post'
import { readLocalAuditLogState } from '~/server/utils/localAuditLogStore'
import { readLocalNotificationState } from '~/server/utils/localNotificationStore'
import { readLocalPlaceIssueState } from '~/server/utils/localPlaceIssueStore'

const MANAGER_COOKIE = 'rybolov_cetin_mock_session=manager'
const WORKER_COOKIE = 'rybolov_cetin_mock_session=worker'
const MARSHAL_COOKIE = 'rybolov_cetin_mock_session=marshal'

const localEnvKeys = [
  'RYBOLOV_LOCAL_AUDIT_LOG_STORE',
  'RYBOLOV_LOCAL_MAP_STORE',
  'RYBOLOV_LOCAL_NOTIFICATION_STORE',
  'RYBOLOV_LOCAL_PLACE_ISSUE_STORE',
] as const

const publicPayload = {
  category: 'lighting',
  description: 'Pri chate nesvieti vonkajšie svetlo a večer je zle vidieť na schody.',
  lake: 'velky-cetin',
  reporterName: 'Route tester',
  reporterPhone: '+421 900 111 222',
  targetId: 'vc-03',
  targetType: 'peg',
  title: 'Nesvieti svetlo',
}

const originalEnv = new Map<string, string | undefined>()
let tempDir: string | undefined

interface TestRouteServer {
  baseUrl: string
  close: () => Promise<void>
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'rybolov-place-issue-routes-'))

  for (const key of localEnvKeys) {
    if (!originalEnv.has(key)) {
      originalEnv.set(key, process.env[key])
    }
  }

  const dataDir = join(tempDir, 'data')
  process.env.RYBOLOV_LOCAL_AUDIT_LOG_STORE = join(dataDir, 'audit-log.json')
  process.env.RYBOLOV_LOCAL_MAP_STORE = join(dataDir, 'map-state.json')
  process.env.RYBOLOV_LOCAL_NOTIFICATION_STORE = join(dataDir, 'notification-state.json')
  process.env.RYBOLOV_LOCAL_PLACE_ISSUE_STORE = join(dataDir, 'place-issue-state.json')
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

function createPlaceIssueRouteServerApp() {
  const app = createApp()
  const router = createRouter()

  router.post('/api/place-issues', placeIssuesPostHandler)
  router.get('/api/admin/place-issues', adminPlaceIssuesGetHandler)
  router.post('/api/admin/place-issues/:id/action', adminPlaceIssueActionHandler)
  app.use(router.handler)

  return app
}

async function startRouteServer(): Promise<TestRouteServer> {
  const server = createServer(toNodeListener(createPlaceIssueRouteServerApp()))
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

describe('place issue API routes', () => {
  it('stores a public issue and exposes it to admin', async () => {
    const server = await startRouteServer()

    try {
      const submission = await requestJson<PlaceIssueSubmissionSuccess>(server, '/api/place-issues', {
        body: JSON.stringify(publicPayload),
        cookie: null,
        method: 'POST',
      })

      expect(submission.response.status).toBe(201)
      expect(submission.body.ok).toBe(true)
      expect(submission.body.issue).toMatchObject({
        status: 'new',
        targetId: 'vc-03',
        targetLabel: 'Chata 3',
      })

      const adminState = await requestJson<PlaceIssueStateResponse>(server, '/api/admin/place-issues')
      expect(adminState.response.status).toBe(200)
      expect(adminState.body.placeIssues.some((issue) => issue.id === submission.body.issue.id)).toBe(true)

      const auditState = await readLocalAuditLogState()
      expect(auditState.events.some((event) => event.action === 'place_issue.created')).toBe(true)
      expect(auditState.events.some((event) => event.action === 'notification.place_issue.created')).toBe(true)

      const notificationState = await readLocalNotificationState()
      expect(notificationState.broadcasts[0]).toMatchObject({
        targetTopics: ['service'],
        title: expect.stringContaining('Nový nedostatok'),
      })
    }
    finally {
      await server.close()
    }
  })

  it('lets a worker update status but blocks read-only marshal mutations', async () => {
    const server = await startRouteServer()

    try {
      const seedState = await readLocalPlaceIssueState()
      const issueId = seedState.placeIssues[0]!.id
      const blockedAction = await requestJson(server, `/api/admin/place-issues/${issueId}/action`, {
        body: JSON.stringify({
          assignedTo: 'Kontrolór',
          internalNote: '',
          priority: 'normal',
          resolutionNote: '',
          status: 'triaged',
        }),
        cookie: MARSHAL_COOKIE,
        method: 'POST',
      })

      expect(blockedAction.response.status).toBe(403)

      const workerAction = await requestJson<PlaceIssueActionSuccess>(server, `/api/admin/place-issues/${issueId}/action`, {
        body: JSON.stringify({
          assignedTo: 'Brigádnik',
          internalNote: 'Vymeniť svetlo.',
          priority: 'urgent',
          resolutionNote: '',
          status: 'in-progress',
        }),
        cookie: WORKER_COOKIE,
        method: 'POST',
      })

      expect(workerAction.response.status).toBe(200)
      expect(workerAction.body.issue).toMatchObject({
        assignedTo: 'Brigádnik',
        priority: 'urgent',
        status: 'in-progress',
      })
    }
    finally {
      await server.close()
    }
  })
})
