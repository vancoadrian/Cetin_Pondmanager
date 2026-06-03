import type { MapFacility, MapLayer, MapShape, Peg } from '~/data/pond'
import {
  getValidationMessages,
  mapFacilityInputSchema,
  mapLayerInputSchema,
  mapPegInputSchema,
  mapShapeInputSchema,
} from '~/schemas/pondSchemas'

export interface MapStateResponse {
  ok: true
  mapLayers: MapLayer[]
  mapFacilities: MapFacility[]
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
  mapLayers: MapLayer[]
  mapFacilities: MapFacility[]
  mapShapes: MapShape[]
  pegs: Peg[]
}

function isMapSavePayload(value: unknown): value is {
  enabledLayerIds: unknown[]
  mapLayers?: unknown[]
  mapFacilities?: unknown[]
  mapShapes?: unknown[]
  pegs: unknown[]
} {
  const candidate = value as Partial<{
    enabledLayerIds: unknown[]
    mapLayers: unknown[]
    mapFacilities: unknown[]
    mapShapes: unknown[]
    pegs: unknown[]
  }>

  return (
    Array.isArray(candidate.enabledLayerIds) &&
    Array.isArray(candidate.pegs) &&
    (candidate.mapLayers === undefined || Array.isArray(candidate.mapLayers)) &&
    (candidate.mapFacilities === undefined || Array.isArray(candidate.mapFacilities)) &&
    (candidate.mapShapes === undefined || Array.isArray(candidate.mapShapes))
  )
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
  const parsedLayers: ParsedMapSavePayload['mapLayers'] = []
  const parsedFacilities: ParsedMapSavePayload['mapFacilities'] = []
  const parsedShapes: ParsedMapSavePayload['mapShapes'] = []
  const messages: string[] = []

  for (const rawLayer of rawInput.mapLayers ?? []) {
    const result = mapLayerInputSchema.safeParse(rawLayer)
    if (result.success) {
      parsedLayers.push(result.data)
      continue
    }

    messages.push(...getValidationMessages(result))
  }

  for (const rawPeg of rawInput.pegs) {
    const result = mapPegInputSchema.safeParse(rawPeg)
    if (result.success) {
      parsedPegs.push(result.data)
      continue
    }

    messages.push(...getValidationMessages(result))
  }

  for (const rawFacility of rawInput.mapFacilities ?? []) {
    const result = mapFacilityInputSchema.safeParse(rawFacility)
    if (result.success) {
      parsedFacilities.push(result.data)
      continue
    }

    messages.push(...getValidationMessages(result))
  }

  for (const rawShape of rawInput.mapShapes ?? []) {
    const result = mapShapeInputSchema.safeParse(rawShape)
    if (result.success) {
      parsedShapes.push({
        ...result.data,
        points: result.data.points.map((point) => ({ ...point })),
      })
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
      mapLayers: parsedLayers,
      mapFacilities: parsedFacilities,
      mapShapes: parsedShapes,
      pegs: parsedPegs,
    },
  }
}

function duplicateIds(items: Array<{ id: string }>) {
  const seenIds = new Set<string>()

  return items
    .map((item) => item.id)
    .filter((id) => {
      if (seenIds.has(id)) return true
      seenIds.add(id)

      return false
    })
}

export function saveMapState(
  rawInput: unknown,
  currentState: Omit<MapStateResponse, 'ok' | 'updatedAt'>,
  updatedAt = new Date().toISOString(),
): MapSaveResult {
  const parsed = parseMapSavePayload(rawInput)
  if (!parsed.ok) return parsed

  const knownLayerIds = new Set(currentState.mapLayers.map((layer) => layer.id))
  const unknownLayerIds = parsed.payload.enabledLayerIds.filter((id) => !knownLayerIds.has(id))
  const unknownSubmittedLayerIds = parsed.payload.mapLayers
    .map((layer) => layer.id)
    .filter((id) => !knownLayerIds.has(id))
  const duplicateLayerIds = duplicateIds(parsed.payload.mapLayers)
  const duplicatePegIds = duplicateIds(parsed.payload.pegs)
  const duplicateFacilityIds = duplicateIds(parsed.payload.mapFacilities)
  const duplicateShapeIds = duplicateIds(parsed.payload.mapShapes)

  if (
    unknownLayerIds.length > 0 ||
    unknownSubmittedLayerIds.length > 0 ||
    duplicateLayerIds.length > 0 ||
    duplicatePegIds.length > 0 ||
    duplicateFacilityIds.length > 0 ||
    duplicateShapeIds.length > 0
  ) {
    return failure([
      ...unknownLayerIds.map((id) => `Neznáma vrstva mapy: ${id}.`),
      ...unknownSubmittedLayerIds.map((id) => `Neznáma upravovaná vrstva mapy: ${id}.`),
      ...duplicateLayerIds.map((id) => `Duplicitná vrstva mapy: ${id}.`),
      ...duplicatePegIds.map((id) => `Duplicitné lovné miesto na mape: ${id}.`),
      ...duplicateFacilityIds.map((id) => `Duplicitný servisný bod na mape: ${id}.`),
      ...duplicateShapeIds.map((id) => `Duplicitná zóna na mape: ${id}.`),
    ])
  }

  const enabledLayerIds = new Set(parsed.payload.enabledLayerIds)
  const submittedLayers = new Map(parsed.payload.mapLayers.map((layer) => [layer.id, layer]))

  return {
    ok: true,
    mapLayers: currentState.mapLayers.map((layer) => {
      const submittedLayer = submittedLayers.get(layer.id)

      return {
        ...layer,
        enabled: enabledLayerIds.has(layer.id),
        imageSettings: layer.kind === 'background'
          ? submittedLayer?.imageSettings ?? layer.imageSettings
          : undefined,
      }
    }),
    mapFacilities: parsed.payload.mapFacilities.map((facility) => ({ ...facility })),
    mapShapes: parsed.payload.mapShapes.map((shape) => ({
      ...shape,
      points: shape.points.map((point) => ({ ...point })),
    })),
    message: 'Mapa je uložená do lokálneho store.',
    pegs: parsed.payload.pegs.map((peg) => ({
      ...peg,
      requiresCabinReservation: peg.type === 'cabin' ? Boolean(peg.requiresCabinReservation) : undefined,
    })),
    statusCode: 200,
    updatedAt,
  }
}
