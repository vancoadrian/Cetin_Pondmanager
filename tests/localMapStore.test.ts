import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { mapFacilities, mapLayers, mapShapes, pegs } from '~/app/data/pond'
import {
  mapStateContentEquals,
  readLocalMapDraftState,
  readLocalMapState,
  writeLocalMapDraftState,
  writeLocalMapState,
} from '~/server/utils/localMapStore'

const tempDirs: string[] = []

async function createStorePath() {
  const dir = await mkdtemp(join(tmpdir(), 'rybolov-map-store-'))
  tempDirs.push(dir)

  return join(dir, 'map-state.json')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('localMapStore', () => {
  it('creates a seed map state when the local JSON file does not exist yet', async () => {
    const filePath = await createStorePath()
    const state = await readLocalMapState(filePath)
    const raw = await readFile(filePath, 'utf8')

    expect(state.version).toBe(1)
    expect(state.pegs.length).toBeGreaterThan(0)
    expect(state.mapFacilities.length).toBeGreaterThan(0)
    expect(state.mapLayers.length).toBeGreaterThan(0)
    expect(state.mapShapes.length).toBeGreaterThan(0)
    expect(JSON.parse(raw)).toMatchObject({
      version: 1,
    })
  })

  it('persists edited map point coordinates', async () => {
    const filePath = await createStorePath()
    const state = await readLocalMapState(filePath)
    const updated = await writeLocalMapState(
      {
        mapFacilities: state.mapFacilities,
        mapLayers: state.mapLayers,
        mapShapes: state.mapShapes,
        pegs: state.pegs.map((peg) =>
          peg.id === 'vc-03'
            ? { ...peg, x: 24.5, y: 61.2 }
            : peg,
        ),
      },
      filePath,
    )
    const reread = await readLocalMapState(filePath)

    expect(updated.pegs.find((peg) => peg.id === 'vc-03')?.x).toBe(24.5)
    expect(reread.pegs.find((peg) => peg.id === 'vc-03')?.y).toBe(61.2)
  })

  it('uses the published map as draft fallback and persists draft changes separately', async () => {
    const filePath = await createStorePath()
    const draftPath = filePath.replace('map-state.json', 'map-draft-state.json')
    const published = await writeLocalMapState(
      {
        mapFacilities,
        mapLayers,
        mapShapes,
        pegs: pegs.map((peg) =>
          peg.id === 'vc-03'
            ? { ...peg, label: 'Publikovaná chata 3' }
            : peg,
        ),
      },
      filePath,
    )

    const fallbackDraft = await readLocalMapDraftState(draftPath, published)
    expect(fallbackDraft.pegs.find((peg) => peg.id === 'vc-03')?.label).toBe('Publikovaná chata 3')
    expect(mapStateContentEquals(fallbackDraft, published)).toBe(true)

    await writeLocalMapDraftState(
      {
        mapFacilities,
        mapLayers,
        mapShapes,
        pegs: published.pegs.map((peg) =>
          peg.id === 'vc-03'
            ? { ...peg, label: 'Rozpracovaná chata 3' }
            : peg,
        ),
      },
      draftPath,
    )

    const rereadPublished = await readLocalMapState(filePath)
    const rereadDraft = await readLocalMapDraftState(draftPath, rereadPublished)
    expect(rereadPublished.pegs.find((peg) => peg.id === 'vc-03')?.label).toBe('Publikovaná chata 3')
    expect(rereadDraft.pegs.find((peg) => peg.id === 'vc-03')?.label).toBe('Rozpracovaná chata 3')
    expect(mapStateContentEquals(rereadDraft, rereadPublished)).toBe(false)
  })

  it('migrates missing seed sector polygons without losing existing map edits', async () => {
    const filePath = await createStorePath()
    const legacySectorBand = mapShapes.find((shape) => shape.id === 'shape-vc-sector-band')
    if (!legacySectorBand) throw new Error('Missing seeded sector band.')

    await writeLocalMapState(
      {
        mapFacilities,
        mapLayers,
        mapShapes: [{
          ...legacySectorBand,
          label: 'Upravený sektorový pás',
          tournamentId: undefined,
        }],
        pegs,
      },
      filePath,
    )

    const state = await readLocalMapState(filePath)

    expect(state.mapShapes.find((shape) => shape.id === 'shape-vc-sector-band')).toMatchObject({
      label: 'Upravený sektorový pás',
      tournamentId: 'eccj-2026',
    })
    expect(state.mapShapes.find((shape) => shape.id === 'shape-vc-sector-a1')).toMatchObject({
      sectorId: 'a1',
      tournamentId: 'eccj-2026',
    })
  })
})
