import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { MapLayer, MapShape, Peg } from '~/data/pond'
import { mapLayers, mapShapes, pegs } from '~/data/pond'

export interface LocalMapState {
  mapLayers: MapLayer[]
  mapShapes: MapShape[]
  pegs: Peg[]
  updatedAt: string
  version: 1
}

export function resolveLocalMapStorePath() {
  return process.env.RYBOLOV_LOCAL_MAP_STORE
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'map-state.json')
}

function cloneMapLayers(items: MapLayer[]) {
  return items.map((layer) => ({ ...layer }))
}

function cloneMapShapes(items: MapShape[]) {
  return items.map((shape) => ({
    ...shape,
    points: shape.points.map((point) => ({ ...point })),
  }))
}

function clonePegs(items: Peg[]) {
  return items.map((peg) => ({ ...peg }))
}

export function createSeedMapState(updatedAt = new Date(0).toISOString()): LocalMapState {
  return {
    mapLayers: cloneMapLayers(mapLayers),
    mapShapes: cloneMapShapes(mapShapes),
    pegs: clonePegs(pegs),
    updatedAt,
    version: 1,
  }
}

function isMapState(value: unknown): value is LocalMapState {
  const candidate = value as Partial<LocalMapState>

  return (
    candidate.version === 1 &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.mapLayers) &&
    Array.isArray(candidate.mapShapes) &&
    Array.isArray(candidate.pegs)
  )
}

export async function readLocalMapState(filePath = resolveLocalMapStorePath()): Promise<LocalMapState> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)

    if (isMapState(parsed)) {
      return parsed
    }
  }
  catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException
    if (maybeNodeError.code !== 'ENOENT') {
      console.warn(`Nepodarilo sa načítať lokálny stav mapy: ${maybeNodeError.message}`)
    }
  }

  const seedState = createSeedMapState()
  await writeLocalMapState(seedState, filePath)

  return seedState
}

export async function writeLocalMapState(
  state: Pick<LocalMapState, 'mapLayers' | 'mapShapes' | 'pegs'>,
  filePath = resolveLocalMapStorePath(),
): Promise<LocalMapState> {
  const nextState: LocalMapState = {
    mapLayers: cloneMapLayers(state.mapLayers),
    mapShapes: cloneMapShapes(state.mapShapes),
    pegs: clonePegs(state.pegs),
    updatedAt: new Date().toISOString(),
    version: 1,
  }

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8')

  return nextState
}
