import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { MapFacility, MapLayer, MapShape, Peg } from '~/data/pond'
import { mapFacilities, mapLayers, mapShapes, pegs } from '~/data/pond'

export interface LocalMapState {
  mapFacilities: MapFacility[]
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

export function resolveLocalMapDraftStorePath() {
  return process.env.RYBOLOV_LOCAL_MAP_DRAFT_STORE
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'map-draft-state.json')
}

function cloneMapLayers(items: MapLayer[]) {
  return items.map((layer) => ({
    ...layer,
    imageSettings: layer.imageSettings ? { ...layer.imageSettings } : undefined,
  }))
}

function cloneMapShapes(items: MapShape[]) {
  return items.map((shape) => ({
    ...shape,
    points: shape.points.map((point) => ({ ...point })),
  }))
}

function mergeMapShapesWithSeedMetadata(items: MapShape[]) {
  const seedShapeMap = new Map(mapShapes.map((shape) => [shape.id, shape]))
  const existingShapeIds = new Set(items.map((shape) => shape.id))
  const migratedShapes = items.map((shape) => {
    const seedShape = seedShapeMap.get(shape.id)
    if (!seedShape) return shape

    return {
      ...shape,
      sectorId: shape.sectorId ?? seedShape.sectorId,
      tournamentId: shape.tournamentId ?? seedShape.tournamentId,
    }
  })

  return [
    ...migratedShapes,
    ...mapShapes.filter((shape) => !existingShapeIds.has(shape.id)),
  ]
}

function cloneMapFacilities(items: MapFacility[]) {
  return items.map((facility) => ({ ...facility }))
}

function clonePegs(items: Peg[]) {
  return items.map((peg) => ({ ...peg }))
}

export function cloneLocalMapState(
  state: Pick<LocalMapState, 'mapFacilities' | 'mapLayers' | 'mapShapes' | 'pegs' | 'updatedAt'>,
): LocalMapState {
  return {
    mapFacilities: cloneMapFacilities(state.mapFacilities),
    mapLayers: cloneMapLayers(state.mapLayers),
    mapShapes: cloneMapShapes(state.mapShapes),
    pegs: clonePegs(state.pegs),
    updatedAt: state.updatedAt,
    version: 1,
  }
}

export function createSeedMapState(updatedAt = new Date(0).toISOString()): LocalMapState {
  return cloneLocalMapState({
    mapFacilities,
    mapLayers,
    mapShapes,
    pegs,
    updatedAt,
  })
}

function isMapState(value: unknown): value is Omit<LocalMapState, 'mapFacilities'> & { mapFacilities?: MapFacility[] } {
  const candidate = value as Partial<LocalMapState>

  return (
    candidate.version === 1 &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.mapLayers) &&
    Array.isArray(candidate.mapShapes) &&
    Array.isArray(candidate.pegs)
  )
}

async function readExistingLocalMapState(filePath: string): Promise<LocalMapState | undefined> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)

    if (isMapState(parsed)) {
      const migratedState = {
        ...parsed,
        mapFacilities: cloneMapFacilities(parsed.mapFacilities ?? mapFacilities),
        mapShapes: cloneMapShapes(mergeMapShapesWithSeedMetadata(parsed.mapShapes)),
      }

      if (migratedState.mapShapes.length !== parsed.mapShapes.length || JSON.stringify(migratedState.mapShapes) !== JSON.stringify(parsed.mapShapes)) {
        return writeLocalMapState(migratedState, filePath)
      }

      return migratedState
    }
  }
  catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException
    if (maybeNodeError.code !== 'ENOENT') {
      console.warn(`Nepodarilo sa načítať lokálny stav mapy: ${maybeNodeError.message}`)
    }
  }

  return undefined
}

export async function readLocalMapState(filePath = resolveLocalMapStorePath()): Promise<LocalMapState> {
  const existingState = await readExistingLocalMapState(filePath)
  if (existingState) return existingState

  const seedState = createSeedMapState()
  await writeLocalMapState(seedState, filePath)

  return seedState
}

export async function readLocalMapDraftState(
  draftFilePath = resolveLocalMapDraftStorePath(),
  publishedState?: LocalMapState,
): Promise<LocalMapState> {
  const existingDraft = await readExistingLocalMapState(draftFilePath)
  if (existingDraft) return existingDraft

  return cloneLocalMapState(publishedState ?? await readLocalMapState())
}

export async function writeLocalMapState(
  state: Pick<LocalMapState, 'mapFacilities' | 'mapLayers' | 'mapShapes' | 'pegs'>,
  filePath = resolveLocalMapStorePath(),
): Promise<LocalMapState> {
  const nextState: LocalMapState = {
    mapFacilities: cloneMapFacilities(state.mapFacilities),
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

export async function writeLocalMapDraftState(
  state: Pick<LocalMapState, 'mapFacilities' | 'mapLayers' | 'mapShapes' | 'pegs'>,
  filePath = resolveLocalMapDraftStorePath(),
): Promise<LocalMapState> {
  return writeLocalMapState(state, filePath)
}

function comparableMapState(state: Pick<LocalMapState, 'mapFacilities' | 'mapLayers' | 'mapShapes' | 'pegs'>) {
  return {
    mapFacilities: cloneMapFacilities(state.mapFacilities),
    mapLayers: cloneMapLayers(state.mapLayers),
    mapShapes: cloneMapShapes(state.mapShapes),
    pegs: clonePegs(state.pegs),
  }
}

export function mapStateContentEquals(
  first: Pick<LocalMapState, 'mapFacilities' | 'mapLayers' | 'mapShapes' | 'pegs'>,
  second: Pick<LocalMapState, 'mapFacilities' | 'mapLayers' | 'mapShapes' | 'pegs'>,
) {
  return JSON.stringify(comparableMapState(first)) === JSON.stringify(comparableMapState(second))
}
