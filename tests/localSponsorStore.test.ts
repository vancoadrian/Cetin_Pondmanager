import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  readLocalSponsorState,
  writeLocalSponsorState,
} from '~/server/utils/localSponsorStore'

const tempDirs: string[] = []

async function createStorePath() {
  const dir = await mkdtemp(join(tmpdir(), 'rybolov-sponsor-store-'))
  tempDirs.push(dir)

  return join(dir, 'sponsor-state.json')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('localSponsorStore', () => {
  it('creates a seed sponsor state when the local JSON file does not exist yet', async () => {
    const filePath = await createStorePath()
    const state = await readLocalSponsorState(filePath)
    const raw = await readFile(filePath, 'utf8')

    expect(state.version).toBe(1)
    expect(state.sponsors.length).toBeGreaterThan(0)
    expect(JSON.parse(raw)).toMatchObject({
      version: 1,
    })
  })

  it('persists sponsor visibility and placement changes', async () => {
    const filePath = await createStorePath()
    const seed = await readLocalSponsorState(filePath)
    await writeLocalSponsorState(
      {
        sponsors: seed.sponsors.map((sponsor) =>
          sponsor.id === 'sponsor-carpgear'
            ? { ...sponsor, active: false, placement: 'footer, výsledkovka' }
            : sponsor,
        ),
      },
      filePath,
    )
    const reread = await readLocalSponsorState(filePath)

    expect(reread.sponsors.find((sponsor) => sponsor.id === 'sponsor-carpgear')).toMatchObject({
      active: false,
      placement: 'footer, výsledkovka',
    })
  })

  it('hydrates older sponsor JSON states with structured placement defaults', async () => {
    const filePath = await createStorePath()
    await writeFile(
      filePath,
      JSON.stringify({
        sponsors: [{
          active: true,
          description: 'Hlavný partner testovacieho revíru.',
          id: 'sponsor-carpgear',
          logoText: 'CG',
          name: 'CarpGear Pro',
          placement: 'homepage, súťaže',
          tier: 'main',
        }],
        updatedAt: '2026-05-01T00:00:00.000Z',
        version: 1,
      }),
      'utf8',
    )

    const state = await readLocalSponsorState(filePath)

    expect(state.sponsors[0]).toMatchObject({
      id: 'sponsor-carpgear',
      placementType: 'homepage',
      sortOrder: 1,
      validFrom: '2026-01-01',
    })
  })
})
