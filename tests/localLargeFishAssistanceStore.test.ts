import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { LargeFishAssistanceRequest } from '~/app/services/largeFishAssistanceService'
import {
  readLocalLargeFishAssistanceState,
  writeLocalLargeFishAssistanceState,
} from '~/server/utils/localLargeFishAssistanceStore'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

async function createStorePath() {
  const dir = await mkdtemp(join(tmpdir(), 'rybolov-large-fish-help-'))
  tempDirs.push(dir)
  return join(dir, 'large-fish-assistance.json')
}

const request: LargeFishAssistanceRequest = {
  anglerName: 'Marek H.',
  caughtAt: '2026-06-22T12:05:00.000Z',
  createdAt: '2026-06-22T12:10:00.000Z',
  id: 'fish-help-20260622-chata-3',
  lake: 'velky-cetin',
  lengthCm: 101,
  managerPhone: '0911 298 702',
  note: '',
  pegId: 'vc-03',
  pegLabel: 'Chata 3',
  phone: '+421 900 111 222',
  publicToken: 'secret-token',
  species: 'Kapor',
  status: 'waiting',
  updatedAt: '2026-06-22T12:10:00.000Z',
  weightKg: 21.4,
}

describe('localLargeFishAssistanceStore', () => {
  it('creates an empty store and persists requests', async () => {
    const filePath = await createStorePath()
    const empty = await readLocalLargeFishAssistanceState(filePath)
    expect(empty.requests).toEqual([])

    await writeLocalLargeFishAssistanceState({ requests: [request] }, filePath)
    const stored = await readLocalLargeFishAssistanceState(filePath)
    expect(stored.requests[0]).toEqual(request)
  })
})
