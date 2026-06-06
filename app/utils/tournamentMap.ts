import type { MapShape, Tournament } from '~/data/pond'

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
