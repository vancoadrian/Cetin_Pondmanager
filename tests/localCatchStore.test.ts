import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendLocalCatch,
  appendLocalTripLogbook,
  readLocalCatchState,
  replaceLocalCatchState,
} from '~/server/utils/localCatchStore'

const tempDirs: string[] = []

async function createStorePath() {
  const dir = await mkdtemp(join(tmpdir(), 'rybolov-catch-store-'))
  tempDirs.push(dir)

  return join(dir, 'catch-state.json')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('localCatchStore', () => {
  it('creates seed catch state when the local JSON file does not exist yet', async () => {
    const filePath = await createStorePath()
    const state = await readLocalCatchState(filePath)
    const raw = await readFile(filePath, 'utf8')

    expect(state.version).toBe(1)
    expect(state.catchPhotos).toEqual([])
    expect(state.catches.length).toBeGreaterThan(0)
    expect(state.tripLogbooks.length).toBeGreaterThan(0)
    expect(state.tripLogbookEntries.length).toBeGreaterThan(0)
    expect(JSON.parse(raw)).toMatchObject({
      version: 1,
    })
  })

  it('persists appended catches and logbook entries', async () => {
    const filePath = await createStorePath()
    const state = await readLocalCatchState(filePath)
    const catchRecord = {
      ...state.catches[0]!,
      id: 'catch-test-persisted',
      weightKg: 14.2,
    }
    const entry = {
      ...state.tripLogbookEntries[0]!,
      catchId: catchRecord.id,
      id: 'entry-test-persisted',
      weightKg: 14.2,
    }
    const photo = {
      aiNotes: 'Test.',
      aiStatus: 'queued' as const,
      catchId: catchRecord.id,
      fileName: 'test.png',
      id: 'photo-test-persisted',
      label: 'test.png',
      mimeType: 'image/png',
      publicUrl: '/api/catch-photos/photo-test-persisted',
      sizeBytes: 16,
      status: 'uploaded' as const,
      storagePath: 'catch-photos/photo-test-persisted.png',
      uploadedAt: '2026-05-18T07:00:00.000Z',
    }

    await appendLocalCatch(catchRecord, entry, photo, filePath)
    const reread = await readLocalCatchState(filePath)

    expect(reread.catches[0]?.id).toBe('catch-test-persisted')
    expect(reread.catchPhotos[0]?.catchId).toBe('catch-test-persisted')
    expect(reread.tripLogbookEntries[0]?.catchId).toBe('catch-test-persisted')
  })

  it('persists appended trip logbooks', async () => {
    const filePath = await createStorePath()
    const state = await readLocalCatchState(filePath)
    const logbook = {
      ...state.tripLogbooks[0]!,
      id: 'logbook-test-persisted',
      shareCode: 'CETIN-TEST',
      title: 'Test lokálneho zápisníka',
    }

    await appendLocalTripLogbook(logbook, filePath)
    const reread = await readLocalCatchState(filePath)

    expect(reread.tripLogbooks[0]?.id).toBe('logbook-test-persisted')
    expect(reread.tripLogbooks[0]?.shareCode).toBe('CETIN-TEST')
  })

  it('backfills seed weather data for older local catch records', async () => {
    const filePath = await createStorePath()
    const state = await readLocalCatchState(filePath)
    const legacyState = {
      ...state,
      catches: state.catches.map(({ weather: _weather, ...catchItem }) => catchItem),
    }

    await writeFile(filePath, `${JSON.stringify(legacyState, null, 2)}\n`, 'utf8')
    const reread = await readLocalCatchState(filePath)

    expect(reread.catches.find((catchItem) => catchItem.id === 'c-2401')?.weather).toMatchObject({
      condition: 'polooblačno',
      pressureHpa: 1016,
    })
  })

  it('backfills seed logbook owner links for older local trip logbooks', async () => {
    const filePath = await createStorePath()
    const state = await readLocalCatchState(filePath)
    const legacyState = {
      ...state,
      tripLogbooks: state.tripLogbooks.map((logbook) => ({
        ...logbook,
        members: logbook.members.map(({ userId: _userId, ...member }) => member),
        ownerUserId: undefined,
      })),
    }

    await writeFile(filePath, `${JSON.stringify(legacyState, null, 2)}\n`, 'utf8')
    const reread = await readLocalCatchState(filePath)
    const cabinLogbook = reread.tripLogbooks.find((logbook) => logbook.id === 'logbook-cabin-3-may')

    expect(cabinLogbook).toMatchObject({
      ownerUserId: 'angler-marek',
    })
    expect(cabinLogbook?.members.find((member) => member.id === 'member-marek')).toMatchObject({
      userId: 'angler-marek',
    })
  })

  it('replaces the catch workflow state after admin moderation', async () => {
    const filePath = await createStorePath()
    const state = await readLocalCatchState(filePath)
    const moderatedCatch = {
      ...state.catches[0]!,
      reviewNote: 'Overené správcom.',
      reviewedAt: '2026-05-17T12:00:00.000Z',
      reviewedBy: 'Správca',
      status: 'approved' as const,
    }

    await replaceLocalCatchState(
      {
        ...state,
        catches: [moderatedCatch, ...state.catches.slice(1)],
      },
      filePath,
    )
    const reread = await readLocalCatchState(filePath)

    expect(reread.catches[0]).toMatchObject({
      id: moderatedCatch.id,
      reviewNote: 'Overené správcom.',
      reviewedBy: 'Správca',
      status: 'approved',
    })
  })
})
