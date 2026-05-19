import type { MapLayer, MapShape, Peg } from '~/data/pond'
import { getValidationMessages, mapPointDraftSchema } from '~/schemas/pondSchemas'

export interface MapStateResponse {
  ok: true
  mapLayers: MapLayer[]
  mapShapes: MapShape[]
  pegs: Peg[]
  updatedAt: string
}

export interface MapSaveSuccess extends MapStateResponse {
  message: string
  statusCode: 200
}

export interface MapSaveFailure {
  ok: false
  messages: string[]
  statusCode: 400 | 422
}

export type MapSaveResult = MapSaveFailure | MapSaveSuccess

interface ParsedMapSavePayload {
  enabledLayerIds: string[]
  pegs: Array<{
    capacity: number
    id: string
    label: string
    requiresCabinReservation?: boolean
    type: Peg['type']
    x: number
    y: number
  }>
}

function isMapSavePayload(value: unknown): value is { enabledLayerIds: unknown[], pegs: unknown[] } {
  const candidate = value as Partial<{ enabledLayerIds: unknown[], pegs: unknown[] }>

  return Array.isArray(candidate.enabledLayerIds) && Array.isArray(candidate.pegs)
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function failure(messages: string[], statusCode: MapSaveFailure['statusCode'] = 422): MapSaveFailure {
  return {
    ok: false,
    messages: unique(messages),
    statusCode,
  }
}

function parseMapSavePayload(rawInput: unknown): MapSaveFailure | { ok: true, payload: ParsedMapSavePayload } {
  if (!isMapSavePayload(rawInput)) {
    return failure(['Mapa musí obsahovať body a zoznam aktívnych vrstiev.'], 400)
  }

  const enabledLayerIds = rawInput.enabledLayerIds
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    .map((id) => id.trim())

  const parsedPegs: ParsedMapSavePayload['pegs'] = []
  const messages: string[] = []

  for (const rawPeg of rawInput.pegs) {
    const result = mapPointDraftSchema.safeParse(rawPeg)
    if (result.success) {
      parsedPegs.push(result.data)
      continue
    }

    messages.push(...getValidationMessages(result))
  }

  if (messages.length > 0) {
    return failure(messages)
  }

  return {
    ok: true,
    payload: {
      enabledLayerIds: unique(enabledLayerIds),
      pegs: parsedPegs,
    },
  }
}

export function saveMapState(
  rawInput: unknown,
  currentState: Omit<MapStateResponse, 'ok' | 'updatedAt'>,
  updatedAt = new Date().toISOString(),
): MapSaveResult {
  const parsed = parseMapSavePayload(rawInput)
  if (!parsed.ok) return parsed

  const knownPegIds = new Set(currentState.pegs.map((peg) => peg.id))
  const knownLayerIds = new Set(currentState.mapLayers.map((layer) => layer.id))
  const unknownPegIds = parsed.payload.pegs.filter((peg) => !knownPegIds.has(peg.id)).map((peg) => peg.id)
  const unknownLayerIds = parsed.payload.enabledLayerIds.filter((id) => !knownLayerIds.has(id))

  if (unknownPegIds.length > 0 || unknownLayerIds.length > 0) {
    return failure([
      ...unknownPegIds.map((id) => `Neznámy bod mapy: ${id}.`),
      ...unknownLayerIds.map((id) => `Neznáma vrstva mapy: ${id}.`),
    ])
  }

  const updateById = new Map(parsed.payload.pegs.map((peg) => [peg.id, peg]))
  const enabledLayerIds = new Set(parsed.payload.enabledLayerIds)

  return {
    ok: true,
    mapLayers: currentState.mapLayers.map((layer) => ({
      ...layer,
      enabled: enabledLayerIds.has(layer.id),
    })),
    mapShapes: currentState.mapShapes.map((shape) => ({
      ...shape,
      points: shape.points.map((point) => ({ ...point })),
    })),
    message: 'Mapa je uložená do lokálneho store.',
    pegs: currentState.pegs.map((peg) => {
      const update = updateById.get(peg.id)
      if (!update) return { ...peg }

      return {
        ...peg,
        capacity: update.capacity,
        label: update.label,
        requiresCabinReservation: update.type === 'cabin' ? Boolean(update.requiresCabinReservation) : undefined,
        type: update.type,
        x: update.x,
        y: update.y,
      }
    }),
    statusCode: 200,
    updatedAt,
  }
}
