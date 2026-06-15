import type { MapShape, Tournament } from '~/data/pond'
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

export function createTournamentSectorShapePoints(sector: Tournament['sectors'][number]) {
  const centerX = clampMapPercent(sector.x)
  const centerY = clampMapPercent(sector.y)
  const minX = clampMapPercent(centerX - 7)
  const maxX = clampMapPercent(centerX + 7)
  const minY = clampMapPercent(centerY - 5)
  const maxY = clampMapPercent(centerY + 5)

  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ]
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
