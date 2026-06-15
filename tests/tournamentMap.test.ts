import { describe, expect, it } from 'vitest'
import type { MapShape, Tournament } from '~/app/data/pond'
import {
  createMissingTournamentSectorShapeDrafts,
  createTournamentSectorMapEditorUrl,
  createTournamentSectorShapeDraft,
  getTournamentMapCoverage,
  getTournamentMapSourceSummary,
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
  it('creates deep links to the admin map editor for tournament sectors', () => {
    expect(createTournamentSectorMapEditorUrl('cup 2026', 'sector/a1')).toBe('/admin/mapa?turnaj=cup+2026&sektor=sector%2Fa1')
    expect(createTournamentSectorMapEditorUrl('cup-2026')).toBe('/admin/mapa?turnaj=cup-2026')
  })

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

  it('creates a tournament sector polygon draft around the sector point', () => {
    const edgeSector = { ...tournament.sectors[0]!, id: 'edge', label: 'Edge', team: 'Edge Team', x: 98, y: 2 }
    const draft = createTournamentSectorShapeDraft(tournament, edgeSector, ['shape-vc-sector-edge-2'])

    expect(draft).toMatchObject({
      id: 'shape-vc-sector-edge-3',
      label: 'Sektor Edge · Edge Team',
      lake: 'velky-cetin',
      sectorId: 'edge',
      tone: 'sector',
      tournamentId: 'cup-2026',
      type: 'sector',
      visibility: 'competition',
    })
    expect(draft.points).toEqual([
      { x: 91, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 7 },
      { x: 91, y: 7 },
    ])
  })

  it('creates drafts only for missing tournament sector polygons', () => {
    const drafts = createMissingTournamentSectorShapeDrafts(tournament, [
      sectorShape(),
      sectorShape({ id: 'other-tournament-b2', sectorId: 'b2', tournamentId: 'other-cup' }),
    ])

    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({
      id: 'shape-vc-sector-b2-3',
      label: 'Sektor B2 · Team B',
      sectorId: 'b2',
      tournamentId: 'cup-2026',
    })
  })

  it('describes the tournament map source for published map state', () => {
    expect(getTournamentMapSourceSummary({ hasUnpublishedChanges: false })).toEqual({
      description: 'Pokrytie zodpovedá publikovanej mape, ktorú vidia rybári.',
      label: 'publikovaná mapa',
      tone: 'published',
    })
  })

  it('describes the tournament map source for draft map state', () => {
    expect(getTournamentMapSourceSummary({
      draftChanges: { total: 3 },
      hasUnpublishedChanges: true,
    })).toEqual({
      description: 'Pokrytie ráta aj rozpracované sektorové polygony (3 nepublikovaných zmien).',
      label: 'draft mapy',
      tone: 'draft',
    })
  })
})
