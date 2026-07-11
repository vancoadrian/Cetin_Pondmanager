import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, createRouter, toNodeListener } from 'h3'
import type {
  CatchStateResponse,
  CatchSubmissionSuccess,
  AnglerLogbooksResponse,
  TripLogbookLookupSuccess,
  TripLogbookSubmissionSuccess,
} from '~/app/services/catchApiService'
import accountLogbooksGetHandler from '~/server/api/account/logbooks.get'
import type { CatchCorrectionSuccess } from '~/app/services/catchCorrectionService'
import type { CatchModerationSuccess } from '~/app/services/catchModerationService'
import adminCatchesGetHandler from '~/server/api/admin/catches.get'
import adminCatchCorrectionHandler from '~/server/api/admin/catches/[id]/correction.post'
import adminCatchDecisionHandler from '~/server/api/admin/catches/[id]/decision.post'
import catchPhotoGetHandler from '~/server/api/catch-photos/[id].get'
import catchesGetHandler from '~/server/api/catches.get'
import catchesPostHandler from '~/server/api/catches.post'
import logbookLookupHandler from '~/server/api/logbooks/[code].get'
import logbooksPostHandler from '~/server/api/logbooks.post'
import { readLocalAuditLogState } from '~/server/utils/localAuditLogStore'
import { readLocalCatchPhotoFile } from '~/server/utils/localCatchPhotoStore'
import { readLocalCatchState } from '~/server/utils/localCatchStore'
import { writeLocalLargeFishAssistanceState } from '~/server/utils/localLargeFishAssistanceStore'
import {
  readLocalNotificationState,
  writeLocalNotificationState,
} from '~/server/utils/localNotificationStore'

const MANAGER_COOKIE = 'rybolov_cetin_mock_session=manager'
const ACCOUNTANT_COOKIE = 'rybolov_cetin_mock_session=accountant'
const MAREK_APP_COOKIE = 'rybolov_cetin_mock_session=angler-marek'
const MAREK_ANGLER_COOKIE = 'rybolov_cetin_mock_angler_session=angler-marek'
const LENKA_ANGLER_COOKIE = 'rybolov_cetin_mock_angler_session=angler-lenka'

const localEnvKeys = [
  'RYBOLOV_LOCAL_ACCOUNT_STORE',
  'RYBOLOV_LOCAL_AUDIT_LOG_STORE',
  'RYBOLOV_LOCAL_CATCH_PHOTO_DIR',
  'RYBOLOV_LOCAL_CATCH_STORE',
  'RYBOLOV_LOCAL_FISH_REGISTRY_STORE',
  'RYBOLOV_LOCAL_LARGE_FISH_ASSISTANCE_STORE',
  'RYBOLOV_LOCAL_MAP_STORE',
  'RYBOLOV_LOCAL_NOTIFICATION_STORE',
  'RYBOLOV_WEATHER_PROVIDER',
] as const

const catchPayload = {
  angler: 'Tomáš Route',
  bait: 'krill dumbell',
  caughtAt: '2026-05-17T18:30',
  lake: 'velky-cetin',
  lengthCm: 84,
  logbookId: 'logbook-cabin-3-may',
  pegId: 'vc-03',
  photo: {
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    fileName: 'kapor-route.png',
    mimeType: 'image/png',
    sizeBytes: 16,
  },
  released: true,
  species: 'Kapor',
  weightKg: 12.6,
}

const originalEnv = new Map<string, string | undefined>()
let tempDir: string | undefined

interface TestRouteServer {
  baseUrl: string
  close: () => Promise<void>
}

interface ValidationErrorResponse {
  data: {
    messages: string[]
  }
  statusMessage: string
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'rybolov-catch-routes-'))

  for (const key of localEnvKeys) {
    if (!originalEnv.has(key)) {
      originalEnv.set(key, process.env[key])
    }
  }

  const dataDir = join(tempDir, 'data')
  process.env.RYBOLOV_LOCAL_ACCOUNT_STORE = join(dataDir, 'account-state.json')
  process.env.RYBOLOV_LOCAL_AUDIT_LOG_STORE = join(dataDir, 'audit-log.json')
  process.env.RYBOLOV_LOCAL_CATCH_PHOTO_DIR = join(dataDir, 'catch-photos')
  process.env.RYBOLOV_LOCAL_CATCH_STORE = join(dataDir, 'catch-state.json')
  process.env.RYBOLOV_LOCAL_FISH_REGISTRY_STORE = join(dataDir, 'fish-registry-state.json')
  process.env.RYBOLOV_LOCAL_LARGE_FISH_ASSISTANCE_STORE = join(dataDir, 'large-fish-assistance-state.json')
  process.env.RYBOLOV_LOCAL_MAP_STORE = join(dataDir, 'map-state.json')
  process.env.RYBOLOV_LOCAL_NOTIFICATION_STORE = join(dataDir, 'notification-state.json')
  process.env.RYBOLOV_WEATHER_PROVIDER = 'mock'
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

function createCatchRouteServerApp() {
  const app = createApp()
  const router = createRouter()

  router.get('/api/catches', catchesGetHandler)
  router.get('/api/account/logbooks', accountLogbooksGetHandler)
  router.get('/api/catch-photos/:id', catchPhotoGetHandler)
  router.post('/api/catches', catchesPostHandler)
  router.get('/api/logbooks/:code', logbookLookupHandler)
  router.post('/api/logbooks', logbooksPostHandler)
  router.get('/api/admin/catches', adminCatchesGetHandler)
  router.post('/api/admin/catches/:id/correction', adminCatchCorrectionHandler)
  router.post('/api/admin/catches/:id/decision', adminCatchDecisionHandler)
  app.use(router.handler)

  return app
}

async function startRouteServer(): Promise<TestRouteServer> {
  const server = createServer(toNodeListener(createCatchRouteServerApp()))
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

async function requestRaw(
  server: TestRouteServer,
  path: string,
  init: RequestInit & { cookie?: string | null } = {},
) {
  const headers = new Headers(init.headers)

  if (init.cookie !== null) {
    headers.set('cookie', init.cookie ?? MANAGER_COOKIE)
  }

  return fetch(`${server.baseUrl}${path}`, {
    ...init,
    headers,
  })
}

describe('catch API routes', () => {
  it('notifies internal managers about a large catch without duplicating an existing assistance call', async () => {
    const server = await startRouteServer()
    const now = '2026-06-21T16:30:00.000Z'

    try {
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

      const largeCatchPayload = {
        ...catchPayload,
        angler: 'Marek bez privolania',
        caughtAt: '2026-06-21T18:25',
        lengthCm: 101,
        logbookId: undefined,
        photo: undefined,
        species: 'Kapor',
        weightKg: 21.4,
      }
      const submission = await requestJson<CatchSubmissionSuccess>(server, '/api/catches', {
        body: JSON.stringify(largeCatchPayload),
        cookie: null,
        method: 'POST',
      })
      expect(submission.response.status).toBe(201)

      const notificationState = await readLocalNotificationState()
      expect(notificationState.broadcasts[0]).toMatchObject({
        recipientCount: 1,
        targetAudience: {
          requestId: submission.body.catch.id,
          roles: ['owner', 'manager'],
        },
        title: 'Veľký úlovok čaká na kontrolu',
      })
      expect(notificationState.alerts).toEqual([])

      const assistedPayload = {
        ...largeCatchPayload,
        angler: 'Marek s privolaním',
        caughtAt: '2026-06-21T18:40',
        pegId: 'vc-04',
        weightKg: 22.1,
      }
      await writeLocalLargeFishAssistanceState({
        requests: [{
          anglerName: assistedPayload.angler,
          caughtAt: assistedPayload.caughtAt,
          createdAt: now,
          id: 'fish-help-20260621-miesto-4',
          lake: assistedPayload.lake,
          lengthCm: assistedPayload.lengthCm,
          managerPhone: '0911 298 702',
          note: '',
          pegId: assistedPayload.pegId,
          pegLabel: 'Miesto 4',
          phone: '+421 900 111 222',
          publicToken: 'secret-token',
          species: assistedPayload.species,
          status: 'on-route',
          updatedAt: now,
          weightKg: assistedPayload.weightKg,
        }],
      })

      const assistedSubmission = await requestJson<CatchSubmissionSuccess>(server, '/api/catches', {
        body: JSON.stringify(assistedPayload),
        cookie: null,
        method: 'POST',
      })
      expect(assistedSubmission.response.status).toBe(201)

      const notificationStateAfterAssistedCatch = await readLocalNotificationState()
      expect(notificationStateAfterAssistedCatch.broadcasts).toHaveLength(1)
      expect(notificationStateAfterAssistedCatch.broadcasts[0]?.targetAudience?.requestId).toBe(
        submission.body.catch.id,
      )

      const auditState = await readLocalAuditLogState()
      expect(auditState.events).toContainEqual(expect.objectContaining({
        action: 'notification.large_catch.created',
        entityType: 'notification_broadcast',
      }))
    }
    finally {
      await server.close()
    }
  })

  it('keeps newly submitted catches private until admin approval', async () => {
    const server = await startRouteServer()

    try {
      const submission = await requestJson<CatchSubmissionSuccess>(server, '/api/catches', {
        body: JSON.stringify(catchPayload),
        cookie: null,
        method: 'POST',
      })

      expect(submission.response.status).toBe(201)
      expect(submission.body.ok).toBe(true)
      expect(submission.body.catch.status).toBe('pending')
      expect(submission.body.catch.photoLabel).toBe('kapor-route.png')
      expect(submission.body.catchPhoto).toMatchObject({
        aiStatus: 'queued',
        fileName: 'kapor-route.png',
        status: 'uploaded',
      })
      expect(submission.body.logbookEntry).toMatchObject({
        catchId: submission.body.catch.id,
        logbookId: 'logbook-cabin-3-may',
        photoStatus: 'uploaded',
      })
      expect(await readLocalCatchPhotoFile(submission.body.catchPhoto!)).toHaveLength(8)

      const publicPhotoBeforeApproval = await requestRaw(
        server,
        `/api/catch-photos/${submission.body.catchPhoto!.id}`,
        { cookie: null },
      )
      expect(publicPhotoBeforeApproval.status).toBe(404)

      const adminPhotoBeforeApproval = await requestRaw(
        server,
        `/api/catch-photos/${submission.body.catchPhoto!.id}`,
      )
      expect(adminPhotoBeforeApproval.status).toBe(200)
      expect(adminPhotoBeforeApproval.headers.get('content-type')).toBe('image/png')
      expect((await adminPhotoBeforeApproval.arrayBuffer()).byteLength).toBe(8)

      const publicBeforeApproval = await requestJson<CatchStateResponse>(server, '/api/catches', {
        cookie: null,
      })
      expect(publicBeforeApproval.response.status).toBe(200)
      expect(publicBeforeApproval.body.tripLogbooks).toHaveLength(0)
      expect(publicBeforeApproval.body.tripLogbookEntries).toHaveLength(0)
      expect(publicBeforeApproval.body.catches.some((catchItem) => catchItem.id === submission.body.catch.id)).toBe(false)
      expect(publicBeforeApproval.body.catchPhotos.some((photo) => photo.catchId === submission.body.catch.id)).toBe(false)
      expect(
        publicBeforeApproval.body.tripLogbookEntries.some((entry) => entry.catchId === submission.body.catch.id),
      ).toBe(false)
      expect(publicBeforeApproval.body.catches.every((catchItem) => catchItem.status === 'approved')).toBe(true)

      const adminState = await requestJson<CatchStateResponse>(server, '/api/admin/catches')
      expect(adminState.response.status).toBe(200)
      expect(adminState.body.catches.find((catchItem) => catchItem.id === submission.body.catch.id)?.status).toBe('pending')

      const approval = await requestJson<CatchModerationSuccess>(
        server,
        `/api/admin/catches/${submission.body.catch.id}/decision`,
        {
          body: JSON.stringify({
            decisionMode: 'approve',
            note: 'Fotka, miesto a rozmery sedia.',
          }),
          method: 'POST',
        },
      )
      expect(approval.response.status).toBe(200)
      expect(approval.body.ok).toBe(true)
      expect(approval.body.catch.status).toBe('approved')
      expect(approval.body.catch.reviewNote).toBe('Fotka, miesto a rozmery sedia.')

      const publicAfterApproval = await requestJson<CatchStateResponse>(server, '/api/catches', {
        cookie: null,
      })
      const publicCatch = publicAfterApproval.body.catches.find((catchItem) => catchItem.id === submission.body.catch.id)
      expect(publicCatch).toMatchObject({
        angler: 'Tomáš Route',
        species: 'Kapor',
        status: 'approved',
        weightKg: 12.6,
      })
      expect(publicCatch).not.toHaveProperty('reviewNote')
      expect(publicAfterApproval.body.catchPhotos.find((photo) => photo.catchId === submission.body.catch.id)?.fileName).toBe('kapor-route.png')
      expect(publicAfterApproval.body.tripLogbooks).toHaveLength(0)
      expect(publicAfterApproval.body.tripLogbookEntries).toHaveLength(0)

      const logbookLookupAfterApproval = await requestJson<TripLogbookLookupSuccess>(
        server,
        '/api/logbooks/CETIN-3MAY',
        { cookie: null },
      )
      const logbookCatch = logbookLookupAfterApproval.body.catches.find((catchItem) => catchItem.id === submission.body.catch.id)
      expect(logbookLookupAfterApproval.response.status).toBe(200)
      expect(logbookLookupAfterApproval.body.tripLogbookEntries.some((entry) => entry.catchId === submission.body.catch.id)).toBe(true)
      expect(logbookCatch).toMatchObject({
        angler: 'Tomáš Route',
        status: 'approved',
      })
      expect(logbookCatch).not.toHaveProperty('reviewNote')
      expect(logbookCatch).not.toHaveProperty('reviewedBy')

      const publicPhotoAfterApproval = await requestRaw(
        server,
        `/api/catch-photos/${submission.body.catchPhoto!.id}`,
        { cookie: null },
      )
      expect(publicPhotoAfterApproval.status).toBe(200)
      expect(publicPhotoAfterApproval.headers.get('content-type')).toBe('image/png')
      expect((await publicPhotoAfterApproval.arrayBuffer()).byteLength).toBe(8)

      const auditState = await readLocalAuditLogState()
      expect(auditState.events.some((event) =>
        event.entityId === submission.body.catch.id &&
        event.action === 'catch.record.created' &&
        event.actorRole === 'angler',
      )).toBe(true)
      expect(auditState.events.some((event) =>
        event.entityId === submission.body.catch.id &&
        event.action === 'catch.record.approved' &&
        event.actorId === 'manager',
      )).toBe(true)
    }
    finally {
      await server.close()
    }
  })

  it('creates a public trip logbook and stores an audit event', async () => {
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<TripLogbookSubmissionSuccess>(server, '/api/logbooks', {
        body: JSON.stringify({
          lake: 'velky-cetin',
          memberNames: ['Marek Route', 'Tomáš Route'],
          mode: 'group',
          pegIds: ['vc-03'],
          title: 'Route test výprava',
        }),
        cookie: null,
        method: 'POST',
      })

      expect(response.status).toBe(201)
      expect(body.ok).toBe(true)
      expect(body.logbook.shareCode).toMatch(/^CETIN-ROUT-[2-9A-HJ-NP-Z]{6}$/)
      expect(body.logbook.members).toHaveLength(2)
      expect(body.logbook.owner).toBe('Marek Route')

      const state = await readLocalCatchState()
      expect(state.tripLogbooks.find((logbook) => logbook.id === body.logbook.id)?.shareCode).toBe(body.logbook.shareCode)

      const publicState = await requestJson<CatchStateResponse>(server, '/api/catches', {
        cookie: null,
      })
      expect(publicState.body.tripLogbooks.some((logbook) => logbook.id === body.logbook.id)).toBe(false)

      const lookup = await requestJson<TripLogbookLookupSuccess>(
        server,
        `/api/logbooks/${body.logbook.shareCode.toLowerCase()}`,
        { cookie: null },
      )
      expect(lookup.response.status).toBe(200)
      expect(lookup.body.ok).toBe(true)
      expect(lookup.body.logbook.id).toBe(body.logbook.id)
      expect(lookup.body.logbook.shareCode).toBe(body.logbook.shareCode)
      expect(lookup.body.logbook).not.toHaveProperty('ownerUserId')
      expect(lookup.body.logbook.members.every((member) => !('userId' in member))).toBe(true)
      expect(lookup.body.tripLogbookEntries).toEqual([])

      const missingLookup = await requestJson<ValidationErrorResponse>(
        server,
        '/api/logbooks/CETIN-ROUT-XXXXXX',
        { cookie: null },
      )
      expect(missingLookup.response.status).toBe(404)
      expect(missingLookup.body.statusMessage).toBe('Trip logbook lookup failed')
      expect(missingLookup.body.data.messages).toContain('Zápisník s týmto kódom sa nenašiel.')

      const auditState = await readLocalAuditLogState()
      expect(auditState.events).toContainEqual(expect.objectContaining({
        action: 'trip_logbook.created',
        actorRole: 'angler',
        area: 'logbooks',
        entityId: body.logbook.id,
      }))
    }
    finally {
      await server.close()
    }
  })

  it('keeps an authenticated angler logbook in account history', async () => {
    const server = await startRouteServer()

    try {
      const created = await requestJson<TripLogbookSubmissionSuccess>(server, '/api/logbooks', {
        body: JSON.stringify({
          lake: 'velky-cetin',
          memberNames: ['Nesprávny vlastník', 'Tomáš Route'],
          mode: 'group',
          pegIds: ['vc-03'],
          title: 'Výprava v účte',
        }),
        cookie: MAREK_APP_COOKIE,
        method: 'POST',
      })
      expect(created.response.status).toBe(201)
      expect(created.body.logbook).toMatchObject({
        owner: 'Marek H.',
        ownerUserId: 'angler-marek',
      })
      expect(created.body.logbook.members[0]).toMatchObject({
        role: 'owner',
        userId: 'angler-marek',
      })

      const marekHistory = await requestJson<AnglerLogbooksResponse>(
        server,
        '/api/account/logbooks',
        { cookie: MAREK_APP_COOKIE },
      )
      expect(marekHistory.response.status).toBe(200)
      expect(marekHistory.body.account.email).toBe('marek.horvath@example.test')
      expect(marekHistory.body.tripLogbooks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: created.body.logbook.id }),
        expect.objectContaining({ id: 'logbook-cabin-3-may' }),
      ]))
      expect(
        marekHistory.body.tripLogbooks.find((logbook) => logbook.id === created.body.logbook.id)?.ownerUserId,
      ).toBe('angler-marek')

      const legacyMarekHistory = await requestJson<AnglerLogbooksResponse>(
        server,
        '/api/account/logbooks',
        { cookie: MAREK_ANGLER_COOKIE },
      )
      expect(legacyMarekHistory.response.status).toBe(200)
      expect(legacyMarekHistory.body.tripLogbooks).toContainEqual(expect.objectContaining({
        id: created.body.logbook.id,
      }))

      const lenkaHistory = await requestJson<AnglerLogbooksResponse>(
        server,
        '/api/account/logbooks',
        { cookie: LENKA_ANGLER_COOKIE },
      )
      expect(lenkaHistory.response.status).toBe(200)
      expect(lenkaHistory.body.tripLogbooks.some((logbook) => logbook.id === created.body.logbook.id)).toBe(false)
      expect(lenkaHistory.body.tripLogbooks).toContainEqual(expect.objectContaining({
        id: 'logbook-kocka-evening',
      }))

      const anonymousHistory = await requestJson<{ statusMessage: string }>(
        server,
        '/api/account/logbooks',
        { cookie: null },
      )
      expect(anonymousHistory.response.status).toBe(401)
      expect(anonymousHistory.body.statusMessage).toBe('Angler login required')
    }
    finally {
      await server.close()
    }
  })

  it('blocks catch moderation mutations for read-only catch roles', async () => {
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<{ data: { requiredMode: string, role: string }, statusMessage: string }>(
        server,
        '/api/admin/catches/c-2403/decision',
        {
          body: JSON.stringify({
            decisionMode: 'reject',
            note: 'Test read-only blokácie.',
          }),
          cookie: ACCOUNTANT_COOKIE,
          method: 'POST',
        },
      )

      expect(response.status).toBe(403)
      expect(body.statusMessage).toBe('Admin access denied')
      expect(body.data.role).toBe('accountant')
      expect(body.data.requiredMode).toBe('operate')
    }
    finally {
      await server.close()
    }
  })

  it('corrects catch data through the admin route and writes audit metadata', async () => {
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<CatchCorrectionSuccess>(
        server,
        '/api/admin/catches/c-2403/correction',
        {
          body: JSON.stringify({
            angler: 'Tím Junior A',
            bait: 'cesnak boilies 18 mm',
            caughtAt: '2026-05-15T00:10',
            lake: 'velky-cetin',
            lengthCm: 76,
            logbookLinkMode: 'keep',
            notes: 'Správca opravil čas a nástrahu podľa fotky.',
            pegId: 'vc-04',
            released: true,
            species: 'Kapor',
            weightKg: 9.8,
          }),
          method: 'POST',
        },
      )

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.catch).toMatchObject({
        bait: 'cesnak boilies 18 mm',
        caughtAt: '2026-05-15T00:10',
        lengthCm: 76,
        pegId: 'vc-04',
        weightKg: 9.8,
      })

      const state = await readLocalCatchState()
      expect(state.catches.find((catchItem) => catchItem.id === 'c-2403')?.bait).toBe('cesnak boilies 18 mm')

      const auditState = await readLocalAuditLogState()
      expect(auditState.events).toContainEqual(expect.objectContaining({
        action: 'catch.record.corrected',
        actorId: 'manager',
        entityId: 'c-2403',
      }))
    }
    finally {
      await server.close()
    }
  })

  it('returns validation messages from catch routes in the H3 error envelope', async () => {
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<ValidationErrorResponse>(server, '/api/catches', {
        body: JSON.stringify({
          ...catchPayload,
          pegId: 'missing-peg',
        }),
        cookie: null,
        method: 'POST',
      })

      expect(response.status).toBe(404)
      expect(body.statusMessage).toBe('Catch record validation failed')
      expect(body.data.messages).toContain('Vybrané lovné miesto neexistuje pre zvolené jazero.')
    }
    finally {
      await server.close()
    }
  })
})
