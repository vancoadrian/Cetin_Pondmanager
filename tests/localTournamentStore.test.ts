import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendLocalTournamentRequest,
  readLocalTournamentState,
  writeLocalTournamentState,
} from '~/server/utils/localTournamentStore'

const tempDirs: string[] = []

async function createStorePath() {
  const dir = await mkdtemp(join(tmpdir(), 'rybolov-tournament-store-'))
  tempDirs.push(dir)

  return join(dir, 'tournament-state.json')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('localTournamentStore', () => {
  it('creates seed tournament state when the local JSON file does not exist yet', async () => {
    const filePath = await createStorePath()
    const state = await readLocalTournamentState(filePath)
    const raw = await readFile(filePath, 'utf8')

    expect(state.version).toBe(1)
    expect(state.tournaments.length).toBeGreaterThan(0)
    expect(state.tournamentRequests.length).toBeGreaterThan(0)
    expect(state.tournamentMarshals.length).toBeGreaterThan(0)
    expect(JSON.parse(raw)).toMatchObject({
      version: 1,
    })
  })

  it('persists appended tournament requests', async () => {
    const filePath = await createStorePath()
    const state = await readLocalTournamentState(filePath)
    const request = {
      ...state.tournamentRequests[0]!,
      id: 'tr-test-persisted',
      status: 'new' as const,
    }

    await appendLocalTournamentRequest(request, filePath)
    const reread = await readLocalTournamentState(filePath)

    expect(reread.tournamentRequests[0]?.id).toBe('tr-test-persisted')
  })

  it('persists admin changes to marshals and requests', async () => {
    const filePath = await createStorePath()
    const state = await readLocalTournamentState(filePath)
    await writeLocalTournamentState(
      {
        ...state,
        tournamentMarshals: state.tournamentMarshals.map((marshal) =>
          marshal.id === 'marshal-1'
            ? { ...marshal, status: 'available' }
            : marshal,
        ),
        tournamentRequests: state.tournamentRequests.map((request) =>
          request.id === 'tr-1001'
            ? { ...request, status: 'resolved' }
            : request,
        ),
      },
      filePath,
    )

    const reread = await readLocalTournamentState(filePath)

    expect(reread.tournamentMarshals.find((marshal) => marshal.id === 'marshal-1')?.status).toBe('available')
    expect(reread.tournamentRequests.find((request) => request.id === 'tr-1001')?.status).toBe('resolved')
  })
})
