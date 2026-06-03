import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createSeedCabinCatalogState,
  readLocalCabinCatalogState,
  writeLocalCabinCatalogState,
} from '~/server/utils/localCabinCatalogStore'

let tempDirectories: string[] = []

afterEach(async () => {
  await Promise.all(tempDirectories.map((directory) => rm(directory, { force: true, recursive: true })))
  tempDirectories = []
})

async function createStorePath() {
  const directory = await mkdtemp(join(tmpdir(), 'rybolov-cabin-catalog-'))
  tempDirectories.push(directory)

  return join(directory, 'cabin-catalog-state.json')
}

describe('local cabin catalog store', () => {
  it('creates seed state when the file does not exist', async () => {
    const storePath = await createStorePath()
    const state = await readLocalCabinCatalogState(storePath)

    expect(state.version).toBe(1)
    expect(state.cabinProducts.length).toBeGreaterThan(0)
    expect(state.cabinProducts[0]?.pegIds.length).toBeGreaterThan(0)
  })

  it('persists cabin product peg links', async () => {
    const storePath = await createStorePath()
    const seedState = createSeedCabinCatalogState()
    const updatedCabin = {
      ...seedState.cabinProducts[0]!,
      pegIds: ['vc-10'],
    }

    await writeLocalCabinCatalogState({
      cabinProducts: [updatedCabin],
    }, storePath)
    const state = await readLocalCabinCatalogState(storePath)

    expect(state.cabinProducts).toHaveLength(1)
    expect(state.cabinProducts[0]?.pegIds).toEqual(['vc-10'])
  })
})
