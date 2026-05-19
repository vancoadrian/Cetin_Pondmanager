import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  readLocalMapState,
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
})
