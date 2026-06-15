import type { MapCoordinate, MapShape, Tournament } from '~/data/pond'
import { clampMapPercent } from '~/utils/map'

export interface TournamentSectorMapRow {
  mapped: boolean
  sector: Tournament['sectors'][number]
  shape?: MapShape
}

export interface TournamentMapSourceSummary {
  description: string
  label: string
  tone: 'draft' | 'published'
}

export interface TournamentSectorShapeBoxOptions {
  heightPercent?: number
  widthPercent?: number
}

export type TournamentSectorShapeAlignmentMode = 'box' | 'shoreline'

export interface TournamentSectorShapeAlignmentOptions extends TournamentSectorShapeBoxOptions {
  mode?: TournamentSectorShapeAlignmentMode
}

export interface AlignTournamentSectorShapesResult {
  shapes: MapShape[]
  updatedCount: number
  updatedShapeIds: string[]
}

const DEFAULT_SECTOR_SHAPE_HEIGHT = 10
const DEFAULT_SECTOR_SHAPE_WIDTH = 14
const MIN_SECTOR_SHAPE_SIZE = 4
const MAX_SECTOR_SHAPE_SIZE = 40

export function getTournamentSectorShapes(shapes: MapShape[], tournament: Tournament) {
  return shapes.filter((shape) =>
    shape.type === 'sector' &&
    shape.lake === tournament.lake &&
    (!shape.tournamentId || shape.tournamentId === tournament.id),
  )
}

export function getTournamentSectorMapRows(
  tournament: Tournament,
  shapes: MapShape[],
): TournamentSectorMapRow[] {
  const tournamentShapes = getTournamentSectorShapes(shapes, tournament)

  return tournament.sectors.map((sector) => {
    const shape = tournamentShapes.find((item) => item.sectorId === sector.id)

    return {
      mapped: Boolean(shape),
      sector,
      shape,
    }
  })
}

export function createTournamentSectorMapEditorUrl(tournamentId: string, sectorId?: string) {
  const params = new URLSearchParams({ turnaj: tournamentId })

  if (sectorId) {
    params.set('sektor', sectorId)
  }

  return `/admin/mapa?${params.toString()}`
}

function getTournamentLakePrefix(tournament: Pick<Tournament, 'lake'>) {
  return tournament.lake === 'velky-cetin' ? 'vc' : 'sk'
}

function createUniqueMapShapeId(prefix: string, existingIds: string[]) {
  const existing = new Set(existingIds)
  let index = existing.size + 1
  let candidate = `${prefix}-${index}`

  while (existing.has(candidate)) {
    index += 1
    candidate = `${prefix}-${index}`
  }

  return candidate
}

function normalizeSectorShapeSize(value: number | undefined, fallback: number) {
  const numericValue = Number(value ?? fallback)
  if (!Number.isFinite(numericValue)) return fallback

  return Math.min(MAX_SECTOR_SHAPE_SIZE, Math.max(MIN_SECTOR_SHAPE_SIZE, numericValue))
}

function getPointDistanceSquared(first: Pick<MapCoordinate, 'x' | 'y'>, second: Pick<MapCoordinate, 'x' | 'y'>) {
  return ((first.x - second.x) ** 2) + ((first.y - second.y) ** 2)
}

function projectPointToSegment(
  point: Pick<MapCoordinate, 'x' | 'y'>,
  start: Pick<MapCoordinate, 'x' | 'y'>,
  end: Pick<MapCoordinate, 'x' | 'y'>,
) {
  const segmentX = end.x - start.x
  const segmentY = end.y - start.y
  const segmentLengthSquared = (segmentX ** 2) + (segmentY ** 2)
  if (segmentLengthSquared === 0) return undefined

  const t = Math.min(1, Math.max(0, (((point.x - start.x) * segmentX) + ((point.y - start.y) * segmentY)) / segmentLengthSquared))

  return {
    point: {
      x: start.x + (segmentX * t),
      y: start.y + (segmentY * t),
    },
    segmentLength: Math.sqrt(segmentLengthSquared),
    segmentX,
    segmentY,
  }
}

function getClosedShapeSegments(shape: Pick<MapShape, 'points'>) {
  if (shape.points.length < 2) return []

  return shape.points.flatMap((point, index) => {
    const nextPoint = shape.points[index + 1] ?? (shape.points.length > 2 ? shape.points[0] : undefined)
    return nextPoint ? [{ end: nextPoint, start: point }] : []
  })
}

function findClosestReferenceSegment(
  sector: Tournament['sectors'][number],
  referenceShapes: MapShape[],
) {
  let closest:
    | {
      distanceSquared: number
      projectedPoint: Pick<MapCoordinate, 'x' | 'y'>
      segmentLength: number
      segmentX: number
      segmentY: number
    }
    | undefined

  for (const shape of referenceShapes) {
    for (const segment of getClosedShapeSegments(shape)) {
      const projected = projectPointToSegment(sector, segment.start, segment.end)
      if (!projected) continue

      const distanceSquared = getPointDistanceSquared(sector, projected.point)
      if (!closest || distanceSquared < closest.distanceSquared) {
        closest = {
          distanceSquared,
          projectedPoint: projected.point,
          segmentLength: projected.segmentLength,
          segmentX: projected.segmentX,
          segmentY: projected.segmentY,
        }
      }
    }
  }

  return closest
}

export function getTournamentSectorAlignmentReferenceShapes(
  tournament: Tournament,
  shapes: MapShape[],
) {
  const tournamentLineShapes = shapes.filter((shape) =>
    shape.lake === tournament.lake
    && shape.type === 'sector'
    && !shape.sectorId
    && (!shape.tournamentId || shape.tournamentId === tournament.id),
  )
  const shorelineShapes = shapes.filter((shape) =>
    shape.lake === tournament.lake
    && (shape.type === 'shoreline' || shape.type === 'island')
    && shape.visibility !== 'internal',
  )

  return shorelineShapes.length > 0 ? shorelineShapes : tournamentLineShapes
}

export function createTournamentSectorShapePoints(
  sector: Tournament['sectors'][number],
  options: TournamentSectorShapeBoxOptions = {},
) {
  const centerX = clampMapPercent(sector.x)
  const centerY = clampMapPercent(sector.y)
  const halfWidth = normalizeSectorShapeSize(options.widthPercent, DEFAULT_SECTOR_SHAPE_WIDTH) / 2
  const halfHeight = normalizeSectorShapeSize(options.heightPercent, DEFAULT_SECTOR_SHAPE_HEIGHT) / 2
  const minX = clampMapPercent(centerX - halfWidth)
  const maxX = clampMapPercent(centerX + halfWidth)
  const minY = clampMapPercent(centerY - halfHeight)
  const maxY = clampMapPercent(centerY + halfHeight)

  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ]
}

export function createTournamentSectorShorelineShapePoints(
  sector: Tournament['sectors'][number],
  referenceShapes: MapShape[],
  options: TournamentSectorShapeBoxOptions = {},
) {
  const closest = findClosestReferenceSegment(sector, referenceShapes)
  if (!closest) return createTournamentSectorShapePoints(sector, options)

  const width = normalizeSectorShapeSize(options.widthPercent, DEFAULT_SECTOR_SHAPE_WIDTH)
  const depth = normalizeSectorShapeSize(options.heightPercent, DEFAULT_SECTOR_SHAPE_HEIGHT)
  const tangent = {
    x: closest.segmentX / closest.segmentLength,
    y: closest.segmentY / closest.segmentLength,
  }
  let normal = {
    x: -tangent.y,
    y: tangent.x,
  }
  const toSector = {
    x: sector.x - closest.projectedPoint.x,
    y: sector.y - closest.projectedPoint.y,
  }

  if (((normal.x * toSector.x) + (normal.y * toSector.y)) < 0) {
    normal = {
      x: -normal.x,
      y: -normal.y,
    }
  }

  const halfWidth = width / 2
  const left = {
    x: closest.projectedPoint.x - (tangent.x * halfWidth),
    y: closest.projectedPoint.y - (tangent.y * halfWidth),
  }
  const right = {
    x: closest.projectedPoint.x + (tangent.x * halfWidth),
    y: closest.projectedPoint.y + (tangent.y * halfWidth),
  }

  return [
    left,
    right,
    {
      x: right.x + (normal.x * depth),
      y: right.y + (normal.y * depth),
    },
    {
      x: left.x + (normal.x * depth),
      y: left.y + (normal.y * depth),
    },
  ].map((point) => ({
    x: clampMapPercent(point.x),
    y: clampMapPercent(point.y),
  }))
}

function preserveMapPointMetadata(
  points: MapCoordinate[],
  previousPoints: MapCoordinate[],
) {
  return points.map((point, index) => {
    const previousPoint = previousPoints[index]
    if (!previousPoint) return point

    const metadata: Partial<Pick<MapCoordinate, 'label' | 'role'>> = {}
    if (previousPoint.label) metadata.label = previousPoint.label
    if (previousPoint.role) metadata.role = previousPoint.role

    return {
      ...point,
      ...metadata,
    }
  })
}

export function createTournamentSectorShapeDraft(
  tournament: Tournament,
  sector: Tournament['sectors'][number],
  existingIds: string[],
): MapShape {
  return {
    id: createUniqueMapShapeId(
      `shape-${getTournamentLakePrefix(tournament)}-sector-${sector.id}`,
      existingIds,
    ),
    lake: tournament.lake,
    label: `Sektor ${sector.label}${sector.team ? ` · ${sector.team}` : ''}`,
    points: createTournamentSectorShapePoints(sector),
    sectorId: sector.id,
    tone: 'sector',
    tournamentId: tournament.id,
    type: 'sector',
    visibility: 'competition',
  }
}

export function createMissingTournamentSectorShapeDrafts(
  tournament: Tournament,
  shapes: MapShape[],
) {
  const existingIds = shapes.map((shape) => shape.id)
  const drafts: MapShape[] = []

  for (const row of getTournamentSectorMapRows(tournament, shapes)) {
    if (row.mapped) continue

    const shape = createTournamentSectorShapeDraft(tournament, row.sector, [
      ...existingIds,
      ...drafts.map((draft) => draft.id),
    ])

    drafts.push(shape)
  }

  return drafts
}

export function alignTournamentSectorShapes(
  tournament: Tournament,
  shapes: MapShape[],
  options: TournamentSectorShapeAlignmentOptions = {},
): AlignTournamentSectorShapesResult {
  const shapeSectorMap = new Map<string, Tournament['sectors'][number]>()
  const referenceShapes = getTournamentSectorAlignmentReferenceShapes(tournament, shapes)

  for (const row of getTournamentSectorMapRows(tournament, shapes)) {
    if (row.shape) shapeSectorMap.set(row.shape.id, row.sector)
  }

  const updatedShapeIds: string[] = []
  const nextShapes = shapes.map((shape) => {
    const sector = shapeSectorMap.get(shape.id)
    if (!sector) return shape

    updatedShapeIds.push(shape.id)

    return {
      ...shape,
      points: preserveMapPointMetadata(
        options.mode === 'shoreline'
          ? createTournamentSectorShorelineShapePoints(sector, referenceShapes, options)
          : createTournamentSectorShapePoints(sector, options),
        shape.points,
      ),
      tournamentId: shape.tournamentId ?? tournament.id,
    }
  })

  return {
    shapes: nextShapes,
    updatedCount: updatedShapeIds.length,
    updatedShapeIds,
  }
}

export function getTournamentMapCoverage(rows: TournamentSectorMapRow[]) {
  return {
    mappedSectorCount: rows.filter((row) => row.mapped).length,
    totalSectorCount: rows.length,
  }
}

export function getTournamentMapSourceSummary(mapState: {
  draftChanges?: { total: number }
  hasUnpublishedChanges?: boolean
}): TournamentMapSourceSummary {
  const draftChangeCount = mapState.draftChanges?.total ?? 0

  if (mapState.hasUnpublishedChanges) {
    return {
      description: draftChangeCount > 0
        ? `Pokrytie ráta aj rozpracované sektorové polygony (${draftChangeCount} nepublikovaných zmien).`
        : 'Pokrytie ráta aj rozpracované sektorové polygony pred publikovaním.',
      label: 'draft mapy',
      tone: 'draft',
    }
  }

  return {
    description: 'Pokrytie zodpovedá publikovanej mape, ktorú vidia rybári.',
    label: 'publikovaná mapa',
    tone: 'published',
  }
}
