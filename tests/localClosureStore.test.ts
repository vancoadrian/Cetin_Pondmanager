import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  readLocalClosureState,
  writeLocalClosureState,
} from '~/server/utils/localClosureStore'

const tempDirs: string[] = []

async function createStorePath() {
  const dir = await mkdtemp(join(tmpdir(), 'rybolov-closure-store-'))
  tempDirs.push(dir)

  return join(dir, 'closure-state.json')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('localClosureStore', () => {
  it('creates a seed closure state when the local JSON file does not exist yet', async () => {
    const filePath = await createStorePath()
    const state = await readLocalClosureState(filePath)
    const raw = await readFile(filePath, 'utf8')

    expect(state.version).toBe(1)
    expect(state.lakeClosures.length).toBeGreaterThan(0)
    expect(JSON.parse(raw)).toMatchObject({
      version: 1,
    })
  })

  it('persists closure state updates', async () => {
    const filePath = await createStorePath()
    const seed = await readLocalClosureState(filePath)
    const updated = await writeLocalClosureState(
      {
        lakeClosures: [
          {
            affectsReservations: true,
            from: '2026-07-01',
            id: 'closure-test',
            lake: 'velky-cetin',
            notes: 'Testovacia uzávierka pre lokálne uloženie.',
            reason: 'maintenance',
            title: 'Test servis',
            to: '2026-07-02',
            visibility: 'internal',
          },
          ...seed.lakeClosures,
        ],
      },
      filePath,
    )
    const reread = await readLocalClosureState(filePath)

    expect(updated.lakeClosures[0]?.id).toBe('closure-test')
    expect(reread.lakeClosures.some((closure) => closure.id === 'closure-test')).toBe(true)
  })
})
