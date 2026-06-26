import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, createRouter, toNodeListener } from 'h3'
import type { TournamentStateResponse } from '~/app/services/tournamentApiService'
import accountTournamentStateHandler from '~/server/api/account/tournament-state.get'
import adminTournamentStateHandler from '~/server/api/admin/tournaments/index.get'
import publicTournamentStateHandler from '~/server/api/tournaments.get'
import publicTournamentLeaderboardHandler from '~/server/api/tournaments/[id]/leaderboard.get'
import type { TournamentLeaderboardFeed } from '~/app/utils/tournamentLeaderboard'

let tempDirectory: string | undefined
const originalStore = process.env.RYBOLOV_LOCAL_TOURNAMENT_STORE

interface TestServer {
  baseUrl: string
  close: () => Promise<void>
}

beforeEach(async () => {
  tempDirectory = await mkdtemp(join(tmpdir(), 'rybolov-tournament-visibility-'))
  process.env.RYBOLOV_LOCAL_TOURNAMENT_STORE = join(tempDirectory, 'tournament-state.json')
})

afterEach(async () => {
  if (originalStore === undefined) Reflect.deleteProperty(process.env, 'RYBOLOV_LOCAL_TOURNAMENT_STORE')
  else process.env.RYBOLOV_LOCAL_TOURNAMENT_STORE = originalStore

  if (tempDirectory) {
    await rm(tempDirectory, { force: true, recursive: true })
    tempDirectory = undefined
  }
})

function createTestApp() {
  const app = createApp()
  const router = createRouter()
  router.get('/api/tournaments', publicTournamentStateHandler)
  router.get('/api/tournaments/:id/leaderboard', publicTournamentLeaderboardHandler)
  router.get('/api/account/tournament-state', accountTournamentStateHandler)
  router.get('/api/admin/tournaments', adminTournamentStateHandler)
  app.use(router.handler)
  return app
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
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

async function requestState(server: TestServer, path: string, role?: string) {
  const response = await fetch(`${server.baseUrl}${path}`, {
    headers: role
      ? { cookie: `rybolov_cetin_mock_session=${role}` }
      : undefined,
  })

  return {
    response,
    state: response.ok ? await response.json() as TournamentStateResponse : undefined,
  }
}

describe('tournament visibility routes', () => {
  it('returns only publishable competition data without a session', async () => {
    const server = await startServer()

    try {
      const { response, state } = await requestState(server, '/api/tournaments')

      expect(response.status).toBe(200)
      expect(state?.tournamentMarshals).toEqual([])
      expect(state?.tournamentRequests).toEqual([])
      expect(state?.tournamentPenalties).toEqual([])
      expect(state?.tournamentTeamRegistrations).toEqual([])
      expect(state?.tournamentCatches.every((catchItem) => catchItem.status === 'verified')).toBe(true)
    }
    finally {
      await server.close()
    }
  })

  it('builds the public leaderboard only from verified catches', async () => {
    const server = await startServer()

    try {
      const response = await fetch(`${server.baseUrl}/api/tournaments/eccj-2026/leaderboard`)
      const feed = await response.json() as TournamentLeaderboardFeed
      const waitingSector = feed.rows.find((row) => row.sectorId === 'a2')

      expect(response.status).toBe(200)
      expect(feed.stats.totalScoreWeightKg).toBe(18.6)
      expect(feed.stats.pendingReviewCatchCount).toBe(0)
      expect(waitingSector).toMatchObject({
        disputedCatchCount: 0,
        pendingCatchCount: 0,
        scoreWeightKg: 0,
      })
    }
    finally {
      await server.close()
    }
  })

  it('returns only the assigned sector to a team account', async () => {
    const server = await startServer()

    try {
      const { response, state } = await requestState(server, '/api/account/tournament-state', 'team')

      expect(response.status).toBe(200)
      expect(state?.tournaments[0]?.sectors.map((sector) => sector.id)).toEqual(['a1'])
      expect(state?.tournamentRequests.every((request) => request.sectorId === 'a1')).toBe(true)
    }
    finally {
      await server.close()
    }
  })

  it('returns only assigned sectors to a marshal and blocks the full admin feed', async () => {
    const server = await startServer()

    try {
      const scoped = await requestState(server, '/api/account/tournament-state', 'marshal')
      const full = await requestState(server, '/api/admin/tournaments', 'marshal')

      expect(scoped.response.status).toBe(200)
      expect(scoped.state?.tournamentMarshals.map((marshal) => marshal.id)).toEqual(['marshal-1'])
      expect(scoped.state?.tournaments[0]?.sectors.map((sector) => sector.id)).toEqual(['a1', 'a2', 'a3'])
      expect(full.response.status).toBe(403)
    }
    finally {
      await server.close()
    }
  })

  it('keeps the complete feed behind an authorized internal role', async () => {
    const server = await startServer()

    try {
      const anonymous = await requestState(server, '/api/account/tournament-state')
      const manager = await requestState(server, '/api/admin/tournaments', 'manager')

      expect(anonymous.response.status).toBe(401)
      expect(manager.response.status).toBe(200)
      expect(manager.state?.tournamentMarshals.length).toBeGreaterThan(0)
      expect(manager.state?.tournamentRequests.length).toBeGreaterThan(0)
    }
    finally {
      await server.close()
    }
  })
})
