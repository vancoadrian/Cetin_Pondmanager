import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  readLocalRentalCatalogState,
  writeLocalRentalCatalogState,
} from '~/server/utils/localRentalCatalogStore'

const tempDirs: string[] = []

async function createStorePath() {
  const dir = await mkdtemp(join(tmpdir(), 'rybolov-rental-catalog-store-'))
  tempDirs.push(dir)

  return join(dir, 'rental-catalog-state.json')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('localRentalCatalogStore', () => {
  it('creates a seed rental catalog when the local JSON file does not exist yet', async () => {
    const filePath = await createStorePath()
    const state = await readLocalRentalCatalogState(filePath)
    const raw = await readFile(filePath, 'utf8')

    expect(state.version).toBe(1)
    expect(state.rentalItems.length).toBeGreaterThan(0)
    expect(state.reservationExtras.length).toBeGreaterThan(0)
    expect(JSON.parse(raw)).toMatchObject({
      version: 1,
    })
  })

  it('persists active and stock changes', async () => {
    const filePath = await createStorePath()
    const seed = await readLocalRentalCatalogState(filePath)
    await writeLocalRentalCatalogState(
      {
        rentalItems: seed.rentalItems.map((item) =>
          item.id === 'landing-net-rental' ? { ...item, active: false, stock: 2 } : item,
        ),
        reservationExtras: seed.reservationExtras.map((extra) =>
          extra.id === 'wood-crate' ? { ...extra, active: false, priceLabel: '8 € / bednička' } : extra,
        ),
      },
      filePath,
    )
    const reread = await readLocalRentalCatalogState(filePath)

    expect(reread.rentalItems.find((item) => item.id === 'landing-net-rental')).toMatchObject({
      active: false,
      stock: 2,
    })
    expect(reread.reservationExtras.find((extra) => extra.id === 'wood-crate')).toMatchObject({
      active: false,
      priceLabel: '8 € / bednička',
    })
  })
})
