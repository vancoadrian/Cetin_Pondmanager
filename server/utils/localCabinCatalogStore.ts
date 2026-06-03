import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { CabinProduct } from '~/data/pond'
import { cabinProducts } from '~/data/pond'
import { sortCabinProducts } from '~/services/cabinCatalogService'

export interface LocalCabinCatalogState {
  cabinProducts: CabinProduct[]
  updatedAt: string
  version: 1
}

export function resolveLocalCabinCatalogStorePath() {
  return process.env.RYBOLOV_LOCAL_CABIN_CATALOG_STORE
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'cabin-catalog-state.json')
}

function cloneCabinProducts(items: CabinProduct[]) {
  return items.map((cabin) => ({
    ...cabin,
    equipment: [...cabin.equipment],
    pegIds: [...cabin.pegIds],
  }))
}

export function createSeedCabinCatalogState(updatedAt = new Date(0).toISOString()): LocalCabinCatalogState {
  return {
    cabinProducts: sortCabinProducts(cloneCabinProducts(cabinProducts)),
    updatedAt,
    version: 1,
  }
}

function isCabinProduct(value: unknown): value is CabinProduct {
  const candidate = value as Partial<CabinProduct>

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.label === 'string' &&
    Array.isArray(candidate.pegIds) &&
    typeof candidate.capacity === 'number' &&
    typeof candidate.pricePer24hEur === 'number' &&
    typeof candidate.minimumHours === 'number' &&
    typeof candidate.requiresPermitNote === 'string' &&
    Array.isArray(candidate.equipment)
  )
}

function isCabinCatalogState(value: unknown): value is LocalCabinCatalogState {
  const candidate = value as Partial<LocalCabinCatalogState>

  return (
    candidate.version === 1 &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.cabinProducts) &&
    candidate.cabinProducts.every(isCabinProduct)
  )
}

export async function readLocalCabinCatalogState(
  filePath = resolveLocalCabinCatalogStorePath(),
): Promise<LocalCabinCatalogState> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)

    if (isCabinCatalogState(parsed)) {
      return {
        ...parsed,
        cabinProducts: sortCabinProducts(cloneCabinProducts(parsed.cabinProducts)),
      }
    }
  }
  catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException
    if (maybeNodeError.code !== 'ENOENT') {
      console.warn(`Nepodarilo sa načítať lokálny stav chát: ${maybeNodeError.message}`)
    }
  }

  const seedState = createSeedCabinCatalogState()
  await writeLocalCabinCatalogState(seedState, filePath)

  return seedState
}

export async function writeLocalCabinCatalogState(
  state: Pick<LocalCabinCatalogState, 'cabinProducts'>,
  filePath = resolveLocalCabinCatalogStorePath(),
): Promise<LocalCabinCatalogState> {
  const nextState: LocalCabinCatalogState = {
    cabinProducts: sortCabinProducts(cloneCabinProducts(state.cabinProducts)),
    updatedAt: new Date().toISOString(),
    version: 1,
  }

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8')

  return nextState
}
