import type { MapShape, Tournament } from '~/data/pond'

export interface TournamentSectorMapRow {
  mapped: boolean
  sector: Tournament['sectors'][number]
  shape?: MapShape
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

export function getTournamentMapCoverage(rows: TournamentSectorMapRow[]) {
  return {
    mappedSectorCount: rows.filter((row) => row.mapped).length,
    totalSectorCount: rows.length,
  }
}
