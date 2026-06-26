import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, createRouter, toNodeListener } from 'h3'
import type {
  FishCatchCandidateResponse,
  FishObservationMutationSuccess,
  FishRegistryMutationSuccess,
  FishRegistryStateResponse,
  FishRegistryUpdateSuccess,
} from '~/app/services/fishRegistryService'
import fishRegistryPatchHandler from '~/server/api/admin/fish-registry/[id].patch'
import fishObservationPostHandler from '~/server/api/admin/fish-registry/[id]/observations.post'
import fishCandidatesGetHandler from '~/server/api/admin/fish-registry/candidates.get'
import fishExportHandler from '~/server/api/admin/fish-registry/export.get'
import fishRegistryGetHandler from '~/server/api/admin/fish-registry/index.get'
import fishRegistryPostHandler from '~/server/api/admin/fish-registry/index.post'
import fishPresencePostHandler from '~/server/api/admin/fish-registry/presence.post'
import fishSettingsPostHandler from '~/server/api/admin/fish-registry/settings.post'
import fishRulesGetHandler from '~/server/api/fish-registry/rules.get'
import { readLocalAuditLogState } from '~/server/utils/localAuditLogStore'

const MANAGER_COOKIE = 'rybolov_cetin_mock_session=manager'
const ACCOUNTANT_COOKIE = 'rybolov_cetin_mock_session=accountant'
const envKeys = [
  'RYBOLOV_LOCAL_AUDIT_LOG_STORE',
  'RYBOLOV_LOCAL_CATCH_STORE',
  'RYBOLOV_LOCAL_FISH_REGISTRY_STORE',
  'RYBOLOV_LOCAL_MAP_STORE',
  'RYBOLOV_LOCAL_TOURNAMENT_STORE',
] as const

const originalEnv = new Map<string, string | undefined>()
let tempDirectory: string | undefined

interface TestServer {
  baseUrl: string
  close: () => Promise<void>
}

beforeEach(async () => {
  tempDirectory = await mkdtemp(join(tmpdir(), 'rybolov-fish-routes-'))
  const dataDirectory = join(tempDirectory, 'data')

  for (const key of envKeys) {
    if (!originalEnv.has(key)) originalEnv.set(key, process.env[key])
  }

  process.env.RYBOLOV_LOCAL_AUDIT_LOG_STORE = join(dataDirectory, 'audit-log.json')
  process.env.RYBOLOV_LOCAL_CATCH_STORE = join(dataDirectory, 'catch-state.json')
  process.env.RYBOLOV_LOCAL_FISH_REGISTRY_STORE = join(dataDirectory, 'fish-registry-state.json')
  process.env.RYBOLOV_LOCAL_MAP_STORE = join(dataDirectory, 'map-state.json')
  process.env.RYBOLOV_LOCAL_TOURNAMENT_STORE = join(dataDirectory, 'tournament-state.json')
})

afterEach(async () => {
  for (const key of envKeys) {
    const value = originalEnv.get(key)
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = value
  }

  if (tempDirectory) {
    await rm(tempDirectory, { force: true, recursive: true })
    tempDirectory = undefined
  }
})

function createTestApp() {
  const app = createApp()
  const router = createRouter()
  router.get('/api/admin/fish-registry', fishRegistryGetHandler)
  router.post('/api/admin/fish-registry', fishRegistryPostHandler)
  router.get('/api/admin/fish-registry/candidates', fishCandidatesGetHandler)
  router.get('/api/admin/fish-registry/export', fishExportHandler)
  router.post('/api/admin/fish-registry/presence', fishPresencePostHandler)
  router.post('/api/admin/fish-registry/settings', fishSettingsPostHandler)
  router.patch('/api/admin/fish-registry/:id', fishRegistryPatchHandler)
  router.post('/api/admin/fish-registry/:id/observations', fishObservationPostHandler)
  router.get('/api/fish-registry/rules', fishRulesGetHandler)
  app.use(router.handler)
  return app
}

async function startServer(): Promise<TestServer> {
  const server = createServer(toNodeListener(createTestApp()))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server has no port.')

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  }
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}

async function request(
  server: TestServer,
  path: string,
  init: RequestInit & { cookie?: string } = {},
) {
  const headers = new Headers(init.headers)
  headers.set('cookie', init.cookie ?? MANAGER_COOKIE)
  if (init.body) headers.set('content-type', 'application/json')

  return fetch(`${server.baseUrl}${path}`, {
    ...init,
    headers,
  })
}

describe('fish registry API routes', () => {
  it('registers a fish, stores another observation and exports both', async () => {
    const server = await startServer()

    try {
      const registrationResponse = await request(server, '/api/admin/fish-registry', {
        body: JSON.stringify({
          chipCode: '985141000777321',
          lake: 'velky-cetin',
          name: 'Route test',
          notes: '',
          species: 'Kapor',
          status: 'active',
          taggedAt: '2026-06-21T06:00:00.000Z',
          taggedLengthCm: 98,
          taggedPegId: 'vc-05',
          taggedWeightKg: 20.2,
          taggerName: 'Route tester',
          taggingContext: 'capture',
        }),
        method: 'POST',
      })
      expect(registrationResponse.status).toBe(201)
      const registration = await registrationResponse.json() as FishRegistryMutationSuccess
      const updateResponse = await request(
        server,
        `/api/admin/fish-registry/${registration.fishRecord.id}`,
        {
          body: JSON.stringify({
            changeNote: 'Ryba sa dočasne nedá potvrdiť v revíri.',
            chipCode: '999999999999999',
            name: 'Route test upravená',
            notes: 'Skontrolovať pri ďalšom úlovku.',
            species: 'Kapor obyčajný',
            status: 'missing',
            taggedAt: '2030-01-01T00:00:00.000Z',
          }),
          method: 'PATCH',
        },
      )
      expect(updateResponse.status).toBe(200)
      const updated = await updateResponse.json() as FishRegistryUpdateSuccess
      expect(updated.fishRecord).toMatchObject({
        chipCode: '985141000777321',
        name: 'Route test upravená',
        status: 'missing',
        taggedAt: '2026-06-21T06:00:00.000Z',
      })

      const observationResponse = await request(
        server,
        `/api/admin/fish-registry/${registration.fishRecord.id}/observations`,
        {
          body: JSON.stringify({
            anglerName: 'Test angler',
            bait: 'boilies',
            chipReadBy: 'Route tester',
            lake: 'velky-cetin',
            lengthCm: 100,
            notes: '',
            observedAt: '2026-06-21T09:30:00.000Z',
            pegId: 'vc-09',
            source: 'manager',
            weightKg: 21,
          }),
          method: 'POST',
        },
      )
      expect(observationResponse.status).toBe(201)
      const observation = await observationResponse.json() as FishObservationMutationSuccess
      expect(observation.observations.filter((item) => item.fishId === registration.fishRecord.id)).toHaveLength(2)

      const exportResponse = await request(server, '/api/admin/fish-registry/export')
      const csv = await exportResponse.text()
      expect(exportResponse.status).toBe(200)
      expect(exportResponse.headers.get('content-type')).toContain('text/csv')
      expect(csv).toContain('985141000777321')
      expect(csv).toContain('Test angler')

      const audit = await readLocalAuditLogState()
      expect(audit.events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          action: 'fish.status.changed',
          entityId: registration.fishRecord.id,
          details: expect.objectContaining({
            currentStatus: 'missing',
            previousStatus: 'active',
          }),
        }),
      ]))
    }
    finally {
      await server.close()
    }
  })

  it('keeps the internal fish registry outside the accountant workspace', async () => {
    const server = await startServer()

    try {
      const readResponse = await request(server, '/api/admin/fish-registry', {
        cookie: ACCOUNTANT_COOKIE,
      })
      expect(readResponse.status).toBe(403)

      const writeResponse = await request(server, '/api/admin/fish-registry', {
        body: JSON.stringify({}),
        cookie: ACCOUNTANT_COOKIE,
        method: 'POST',
      })
      expect(writeResponse.status).toBe(403)

      const patchResponse = await request(server, '/api/admin/fish-registry/fish-test', {
        body: JSON.stringify({
          changeNote: '',
          name: 'Zakázaná zmena',
          notes: '',
          species: 'Kapor',
          status: 'active',
        }),
        cookie: ACCOUNTANT_COOKIE,
        method: 'PATCH',
      })
      expect(patchResponse.status).toBe(403)
    }
    finally {
      await server.close()
    }
  })

  it('removes a large catch candidate after it becomes the initial fish observation', async () => {
    const server = await startServer()

    try {
      const beforeResponse = await request(server, '/api/admin/fish-registry/candidates')
      const before = await beforeResponse.json() as FishCatchCandidateResponse
      expect(before.candidates).toEqual([
        expect.objectContaining({
          catchId: 'c-2401',
          weightKg: 18.6,
        }),
      ])

      const registrationResponse = await request(server, '/api/admin/fish-registry', {
        body: JSON.stringify({
          catchId: 'c-2401',
          chipCode: '985141000777999',
          lake: 'velky-cetin',
          name: 'Kandidát',
          notes: '',
          observationSource: 'public-catch',
          species: 'Kapor',
          status: 'active',
          taggedAt: '2026-05-16T05:40:00+02:00',
          taggedLengthCm: 92,
          taggedPegId: 'vc-05',
          taggedWeightKg: 18.6,
          taggerName: 'Route tester',
          taggingContext: 'capture',
        }),
        method: 'POST',
      })
      expect(registrationResponse.status).toBe(201)

      const afterResponse = await request(server, '/api/admin/fish-registry/candidates')
      const after = await afterResponse.json() as FishCatchCandidateResponse
      expect(after.candidates).toHaveLength(0)
    }
    finally {
      await server.close()
    }
  })

  it('updates the lake threshold and preserves it after registry mutations', async () => {
    const server = await startServer()

    try {
      const stateResponse = await request(server, '/api/admin/fish-registry')
      const state = await stateResponse.json() as FishRegistryStateResponse
      const settingsResponse = await request(server, '/api/admin/fish-registry/settings', {
        body: JSON.stringify({
          largeCatchRules: state.settings!.largeCatchRules.map((rule) =>
            rule.lake === 'velky-cetin'
              ? { ...rule, thresholdKg: 20 }
              : rule,
          ),
        }),
        method: 'POST',
      })
      expect(settingsResponse.status).toBe(200)

      const candidatesResponse = await request(server, '/api/admin/fish-registry/candidates')
      const candidates = await candidatesResponse.json() as FishCatchCandidateResponse
      expect(candidates.candidates).toHaveLength(0)

      const publicRulesResponse = await request(server, '/api/fish-registry/rules', { cookie: '' })
      expect(publicRulesResponse.status).toBe(200)
      const publicRules = await publicRulesResponse.json() as {
        rules: Array<{ lake: string, thresholdKg: number }>
      }
      expect(publicRules.rules).toContainEqual(expect.objectContaining({
        availabilityWindows: [
          expect.objectContaining({
            daysOfWeek: [6, 0],
            endsAt: '18:00',
            startsAt: '07:00',
          }),
        ],
        lake: 'velky-cetin',
        thresholdKg: 20,
      }))

      const registrationResponse = await request(server, '/api/admin/fish-registry', {
        body: JSON.stringify({
          chipCode: '985141000888555',
          lake: 'velky-cetin',
          name: 'Pravidlo',
          notes: '',
          species: 'Kapor',
          status: 'active',
          taggedAt: '2026-06-21T06:00:00.000Z',
          taggedPegId: 'vc-05',
          taggerName: 'Route tester',
          taggingContext: 'routine',
        }),
        method: 'POST',
      })
      expect(registrationResponse.status).toBe(201)

      const afterMutationResponse = await request(server, '/api/admin/fish-registry')
      const afterMutation = await afterMutationResponse.json() as FishRegistryStateResponse
      expect(
        afterMutation.settings?.largeCatchRules.find((rule) => rule.lake === 'velky-cetin')?.thresholdKg,
      ).toBe(20)
    }
    finally {
      await server.close()
    }
  })

  it('lets the manager confirm and stop temporary on-site availability', async () => {
    const server = await startServer()

    try {
      const startResponse = await request(server, '/api/admin/fish-registry/presence', {
        body: JSON.stringify({
          action: 'start',
          durationHours: 2,
          lake: 'velky-cetin',
        }),
        method: 'POST',
      })
      expect(startResponse.status).toBe(200)
      const started = await startResponse.json() as {
        lake: string
        settings: FishRegistryStateResponse['settings']
      }
      expect(started.lake).toBe('velky-cetin')
      expect(
        started.settings?.largeCatchRules.find((rule) => rule.lake === 'velky-cetin')?.presenceOverride,
      ).toMatchObject({
        setBy: 'Správca pri vode',
      })

      const publicResponse = await request(server, '/api/fish-registry/rules', { cookie: '' })
      const publicRules = await publicResponse.json() as {
        rules: Array<{ lake: string, presenceOverride?: { setBy: string } }>
      }
      expect(publicRules.rules.find((rule) => rule.lake === 'velky-cetin')?.presenceOverride?.setBy)
        .toBe('Správca pri vode')

      const stopResponse = await request(server, '/api/admin/fish-registry/presence', {
        body: JSON.stringify({
          action: 'stop',
          durationHours: 2,
          lake: 'velky-cetin',
        }),
        method: 'POST',
      })
      expect(stopResponse.status).toBe(200)
      const stopped = await stopResponse.json() as {
        settings: FishRegistryStateResponse['settings']
      }
      expect(
        stopped.settings?.largeCatchRules.find((rule) => rule.lake === 'velky-cetin')?.presenceOverride,
      ).toBeUndefined()

      const forbiddenResponse = await request(server, '/api/admin/fish-registry/presence', {
        body: JSON.stringify({
          action: 'start',
          durationHours: 2,
          lake: 'velky-cetin',
        }),
        cookie: ACCOUNTANT_COOKIE,
        method: 'POST',
      })
      expect(forbiddenResponse.status).toBe(403)
    }
    finally {
      await server.close()
    }
  })

  it('sets temporary availability for multiple nearby lakes in one request', async () => {
    const server = await startServer()

    try {
      const startResponse = await request(server, '/api/admin/fish-registry/presence', {
        body: JSON.stringify({
          action: 'start',
          durationHours: 4,
          lakes: ['velky-cetin', 'strkovisko-kocka'],
        }),
        method: 'POST',
      })
      expect(startResponse.status).toBe(200)
      const started = await startResponse.json() as {
        lake?: string
        lakes: string[]
        settings: FishRegistryStateResponse['settings']
      }
      expect(started.lake).toBeUndefined()
      expect(started.lakes).toEqual(['velky-cetin', 'strkovisko-kocka'])
      expect(started.settings?.largeCatchRules.every((rule) =>
        rule.presenceOverride?.setBy === 'Správca pri vode',
      )).toBe(true)

      const stopResponse = await request(server, '/api/admin/fish-registry/presence', {
        body: JSON.stringify({
          action: 'stop',
          durationHours: 4,
          lakes: ['velky-cetin', 'strkovisko-kocka'],
        }),
        method: 'POST',
      })
      expect(stopResponse.status).toBe(200)
      const stopped = await stopResponse.json() as {
        settings: FishRegistryStateResponse['settings']
      }
      expect(stopped.settings?.largeCatchRules.every((rule) => !rule.presenceOverride)).toBe(true)
    }
    finally {
      await server.close()
    }
  })
})
