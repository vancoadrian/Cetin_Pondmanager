import { describe, expect, it } from 'vitest'
import type { MapShape, Tournament } from '~/app/data/pond'
import {
  getTournamentMapCoverage,
  getTournamentSectorMapRows,
  getTournamentSectorShapes,
} from '~/app/utils/tournamentMap'

const tournament: Tournament = {
  dateRange: '1. 8. - 3. 8. 2026',
  id: 'cup-2026',
  lake: 'velky-cetin',
  name: 'Carp Cup',
  sectors: [
    { id: 'a1', label: 'A1', team: 'Team A', weightKg: 0, x: 20, y: 30 },
    { id: 'b2', label: 'B2', team: 'Team B', weightKg: 0, x: 40, y: 50 },
  ],
  status: 'live',
}

function sectorShape(overrides: Partial<MapShape> = {}): MapShape {
  return {
    id: 'shape-a1',
    lake: 'velky-cetin',
    label: 'Sektor A1',
    points: [
      { x: 18, y: 28 },
      { x: 24, y: 28 },
      { x: 24, y: 35 },
    ],
    sectorId: 'a1',
    tone: 'sector',
    tournamentId: 'cup-2026',
    type: 'sector',
    visibility: 'competition',
    ...overrides,
  }
}

describe('tournament map helpers', () => {
  it('returns sector shapes scoped to the active tournament and lake', () => {
    const shapes = [
      sectorShape(),
      sectorShape({ id: 'generic-band', sectorId: undefined }),
      sectorShape({ id: 'other-lake', lake: 'strkovisko-kocka' }),
      sectorShape({ id: 'other-tournament', tournamentId: 'other-cup' }),
    ]

    expect(getTournamentSectorShapes(shapes, tournament).map((shape) => shape.id)).toEqual([
      'shape-a1',
      'generic-band',
    ])
  })

  it('calculates mapped sectors only from sector-specific polygons', () => {
    const rows = getTournamentSectorMapRows(tournament, [
      sectorShape(),
      sectorShape({ id: 'generic-band', sectorId: undefined }),
    ])

    expect(rows).toMatchObject([
      { mapped: true, sector: { id: 'a1' }, shape: { id: 'shape-a1' } },
      { mapped: false, sector: { id: 'b2' } },
    ])
    expect(getTournamentMapCoverage(rows)).toEqual({
      mappedSectorCount: 1,
      totalSectorCount: 2,
    })
  })
})
