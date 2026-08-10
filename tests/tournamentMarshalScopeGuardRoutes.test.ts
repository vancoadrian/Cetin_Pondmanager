import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, createRouter, toNodeListener } from 'h3'
import adminTournamentPenaltiesHandler from '~/server/api/admin/tournaments/penalties.post'
import adminTournamentRuleChecksHandler from '~/server/api/admin/tournaments/rule-checks.post'
import { createSessionCookieHeader } from './helpers/testAuth'

/**
 * These routes are protected by `requireTournamentMarshalMutationScope`
 * (server/utils/tournamentMarshalScopeGuard.ts), the HTTP-layer enforcement
 * of the pure decision matrix already covered by
 * tests/tournamentMarshalScope.test.ts. This file exercises that guard
 * wired into real route handlers over HTTP, using a real server-issued
 * session (see tests/helpers/testAuth.ts) — the marshal mock user 'marshal'
 * resolves to marshalId 'marshal-1' / tournamentId 'eccj-2026' with sectors
 * a1, a2, a3 assigned (app/composables/useMockAuth.ts, app/data/pond.ts).
 */

let managerCookie: string
let marshalCookie: string

const localEnvKeys = [
  'RYBOLOV_LOCAL_AUDIT_LOG_STORE',
  'RYBOLOV_LOCAL_SESSION_STORE',
  'RYBOLOV_LOCAL_TOURNAMENT_STORE',
] as const

const originalEnv = new Map<string, string | undefined>()
let tempDir: string | undefined

interface TestRouteServer {
  baseUrl: string
  close: () => Promise<void>
}

interface ScopeDeniedResponse {
  data: {
    message?: string
  }
  statusMessage: string
}

interface RuleCheckSuccessResponse {
  check: {
    marshalId: string
    result: string
    sectorId: string
    tournamentId: string
  }
  ok: true
}

interface PenaltySuccessResponse {
  ok: true
  penalty: {
    issuedByMarshalId: string
    sectorId: string
    tournamentId: string
  }
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'rybolov-tournament-marshal-scope-routes-'))

  for (const key of localEnvKeys) {
    if (!originalEnv.has(key)) {
      originalEnv.set(key, process.env[key])
    }
  }

  const dataDir = join(tempDir, 'data')
  process.env.RYBOLOV_LOCAL_AUDIT_LOG_STORE = join(dataDir, 'audit-log.json')
  process.env.RYBOLOV_LOCAL_TOURNAMENT_STORE = join(dataDir, 'tournament-state.json')
  process.env.RYBOLOV_LOCAL_SESSION_STORE = join(dataDir, 'session-state.json')
  managerCookie = await createSessionCookieHeader('manager', 'manager')
  marshalCookie = await createSessionCookieHeader('marshal', 'marshal')
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

function createTournamentMarshalScopeRouteServerApp() {
  const app = createApp()
  const router = createRouter()

  router.post('/api/admin/tournaments/rule-checks', adminTournamentRuleChecksHandler)
  router.post('/api/admin/tournaments/penalties', adminTournamentPenaltiesHandler)
  app.use(router.handler)

  return app
}

async function startRouteServer(): Promise<TestRouteServer> {
  const server = createServer(toNodeListener(createTournamentMarshalScopeRouteServerApp()))
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
    headers.set('cookie', init.cookie ?? managerCookie)
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

function validRuleCheckPayload(overrides: Record<string, unknown> = {}) {
  return {
    marshalId: 'marshal-1',
    note: 'Kontrola štartovej výstroje prebehla v poriadku.',
    result: 'ok',
    sectorId: 'a1',
    tournamentId: 'eccj-2026',
    ...overrides,
  }
}

function validPenaltyPayload(overrides: Record<string, unknown> = {}) {
  return {
    marshalId: 'marshal-1',
    reason: 'Tím prekročil povolený počet prútov v sektore.',
    sectorId: 'a1',
    tournamentId: 'eccj-2026',
    type: 'warning',
    ...overrides,
  }
}

describe('tournament marshal scope guard on rule-check and penalty routes', () => {
  it('lets a marshal act inside their own assigned sector and tournament', async () => {
    const server = await startRouteServer()

    try {
      const ruleCheck = await requestJson<RuleCheckSuccessResponse>(server, '/api/admin/tournaments/rule-checks', {
        body: JSON.stringify(validRuleCheckPayload()),
        cookie: marshalCookie,
        method: 'POST',
      })
      expect(ruleCheck.response.status).toBe(201)
      expect(ruleCheck.body?.ok).toBe(true)
      expect(ruleCheck.body?.check).toMatchObject({
        marshalId: 'marshal-1',
        sectorId: 'a1',
        tournamentId: 'eccj-2026',
      })

      const penalty = await requestJson<PenaltySuccessResponse>(server, '/api/admin/tournaments/penalties', {
        body: JSON.stringify(validPenaltyPayload()),
        cookie: marshalCookie,
        method: 'POST',
      })
      expect(penalty.response.status).toBe(201)
      expect(penalty.body?.ok).toBe(true)
      expect(penalty.body?.penalty).toMatchObject({
        issuedByMarshalId: 'marshal-1',
        sectorId: 'a1',
        tournamentId: 'eccj-2026',
      })
    }
    finally {
      await server.close()
    }
  })

  it('rejects a marshal acting on a sector that is not assigned to them', async () => {
    const server = await startRouteServer()

    try {
      // Sector b1 is assigned to marshal-2, not to the session marshal (marshal-1).
      const ruleCheck = await requestJson<ScopeDeniedResponse>(server, '/api/admin/tournaments/rule-checks', {
        body: JSON.stringify(validRuleCheckPayload({ sectorId: 'b1' })),
        cookie: marshalCookie,
        method: 'POST',
      })
      expect(ruleCheck.response.status).toBe(403)
      expect(ruleCheck.body?.statusMessage).toBe('Tournament marshal scope denied')
      expect(ruleCheck.body?.data.message).toBe('Kontrolór môže pracovať iba vo svojich pridelených sektoroch.')

      const penalty = await requestJson<ScopeDeniedResponse>(server, '/api/admin/tournaments/penalties', {
        body: JSON.stringify(validPenaltyPayload({ sectorId: 'b1' })),
        cookie: marshalCookie,
        method: 'POST',
      })
      expect(penalty.response.status).toBe(403)
      expect(penalty.body?.statusMessage).toBe('Tournament marshal scope denied')
      expect(penalty.body?.data.message).toBe('Kontrolór môže pracovať iba vo svojich pridelených sektoroch.')
    }
    finally {
      await server.close()
    }
  })

  it('rejects a marshal submitting under a marshalId that is not their own account', async () => {
    const server = await startRouteServer()

    try {
      // sectorId stays valid for the session marshal (a1), but marshalId
      // impersonates a different marshal account.
      const ruleCheck = await requestJson<ScopeDeniedResponse>(server, '/api/admin/tournaments/rule-checks', {
        body: JSON.stringify(validRuleCheckPayload({ marshalId: 'marshal-2' })),
        cookie: marshalCookie,
        method: 'POST',
      })
      expect(ruleCheck.response.status).toBe(403)
      expect(ruleCheck.body?.statusMessage).toBe('Tournament marshal scope denied')
      expect(ruleCheck.body?.data.message).toBe('Kontrolór nemôže zapisovať úkony pod identitou iného kontrolóra.')

      const penalty = await requestJson<ScopeDeniedResponse>(server, '/api/admin/tournaments/penalties', {
        body: JSON.stringify(validPenaltyPayload({ marshalId: 'marshal-2' })),
        cookie: marshalCookie,
        method: 'POST',
      })
      expect(penalty.response.status).toBe(403)
      expect(penalty.body?.statusMessage).toBe('Tournament marshal scope denied')
      expect(penalty.body?.data.message).toBe('Kontrolór nemôže zapisovať úkony pod identitou iného kontrolóra.')
    }
    finally {
      await server.close()
    }
  })

  it('lets a non-marshal role (manager) act unscoped, per the guard\'s documented bypass', async () => {
    const server = await startRouteServer()

    try {
      // getTournamentMarshalScopeDecision returns { allowed: true, scoped: false }
      // whenever the session user's role isn't 'marshal' (see
      // app/utils/tournamentMarshalScope.ts), so a manager is never scope-checked
      // and the request proceeds like any other authorized admin mutation.
      const ruleCheck = await requestJson<RuleCheckSuccessResponse>(server, '/api/admin/tournaments/rule-checks', {
        body: JSON.stringify(validRuleCheckPayload()),
        cookie: managerCookie,
        method: 'POST',
      })
      expect(ruleCheck.response.status).toBe(201)
      expect(ruleCheck.body?.ok).toBe(true)

      const penalty = await requestJson<PenaltySuccessResponse>(server, '/api/admin/tournaments/penalties', {
        body: JSON.stringify(validPenaltyPayload()),
        cookie: managerCookie,
        method: 'POST',
      })
      expect(penalty.response.status).toBe(201)
      expect(penalty.body?.ok).toBe(true)
    }
    finally {
      await server.close()
    }
  })
})
