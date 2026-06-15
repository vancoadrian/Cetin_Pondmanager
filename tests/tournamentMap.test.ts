import { describe, expect, it } from 'vitest'
import type { MapShape, Tournament } from '~/app/data/pond'
import {
  alignTournamentSectorShapes,
  createMissingTournamentSectorShapeDrafts,
  createTournamentSectorMapEditorUrl,
  createTournamentSectorShapeDraft,
  createTournamentSectorShapePoints,
  createTournamentSectorShorelineShapePoints,
  getTournamentSectorAlignmentReferenceShapes,
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
  operationsMode: 'full-dispatch',
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

  it('creates sector polygon points with custom dimensions and clamps edges', () => {
    expect(createTournamentSectorShapePoints(tournament.sectors[0]!, {
      heightPercent: 8,
      widthPercent: 20,
    })).toEqual([
      { x: 10, y: 26 },
      { x: 30, y: 26 },
      { x: 30, y: 34 },
      { x: 10, y: 34 },
    ])

    expect(createTournamentSectorShapePoints({
      ...tournament.sectors[0]!,
      x: 2,
      y: 98,
    }, {
      heightPercent: 100,
      widthPercent: 2,
    })).toEqual([
      { x: 0, y: 78 },
      { x: 4, y: 78 },
      { x: 4, y: 100 },
      { x: 0, y: 100 },
    ])
  })

  it('creates sector polygon points as a band from the nearest shoreline segment', () => {
    const shoreline = sectorShape({
      id: 'shoreline',
      points: [
        { x: 10, y: 20 },
        { x: 30, y: 20 },
        { x: 30, y: 40 },
        { x: 10, y: 40 },
      ],
      sectorId: undefined,
      tone: 'water',
      tournamentId: undefined,
      type: 'shoreline',
      visibility: 'public',
    })

    expect(createTournamentSectorShorelineShapePoints(tournament.sectors[0]!, [shoreline], {
      heightPercent: 6,
      widthPercent: 10,
    })).toEqual([
      { x: 15, y: 20 },
      { x: 25, y: 20 },
      { x: 25, y: 26 },
      { x: 15, y: 26 },
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

  it('aligns existing tournament sector polygons and leaves unrelated shapes untouched', () => {
    const result = alignTournamentSectorShapes(tournament, [
      sectorShape({
        id: 'legacy-a1',
        points: [
          { label: 'Breh A1', role: 'shore', x: 1, y: 1 },
          { role: 'boundary', x: 2, y: 1 },
          { x: 2, y: 2 },
        ],
        tournamentId: undefined,
      }),
      sectorShape({ id: 'shape-b2', sectorId: 'b2', points: [{ x: 70, y: 70 }, { x: 72, y: 70 }, { x: 72, y: 72 }] }),
      sectorShape({ id: 'other-cup-b2', sectorId: 'b2', tournamentId: 'other-cup' }),
      sectorShape({ id: 'zone-a1', sectorId: 'a1', tone: 'warning', type: 'zone', visibility: 'internal' }),
    ], {
      heightPercent: 6,
      widthPercent: 12,
    })

    expect(result.updatedCount).toBe(2)
    expect(result.updatedShapeIds).toEqual(['legacy-a1', 'shape-b2'])
    expect(result.shapes.find((shape) => shape.id === 'legacy-a1')).toMatchObject({
      points: [
        { label: 'Breh A1', role: 'shore', x: 14, y: 27 },
        { role: 'boundary', x: 26, y: 27 },
        { x: 26, y: 33 },
        { x: 14, y: 33 },
      ],
      tournamentId: 'cup-2026',
    })
    expect(result.shapes.find((shape) => shape.id === 'shape-b2')?.points).toEqual([
      { x: 34, y: 47 },
      { x: 46, y: 47 },
      { x: 46, y: 53 },
      { x: 34, y: 53 },
    ])
    expect(result.shapes.find((shape) => shape.id === 'other-cup-b2')?.points).toEqual(sectorShape({ id: 'other-cup-b2', sectorId: 'b2', tournamentId: 'other-cup' }).points)
    expect(result.shapes.find((shape) => shape.id === 'zone-a1')?.type).toBe('zone')
  })

  it('aligns tournament sector polygons to shoreline reference shapes', () => {
    const shoreline = sectorShape({
      id: 'shoreline',
      points: [
        { x: 10, y: 20 },
        { x: 30, y: 20 },
        { x: 30, y: 40 },
        { x: 10, y: 40 },
      ],
      sectorId: undefined,
      tone: 'water',
      tournamentId: undefined,
      type: 'shoreline',
      visibility: 'public',
    })
    const result = alignTournamentSectorShapes(tournament, [
      shoreline,
      sectorShape({
        id: 'legacy-a1',
        points: [
          { label: 'Breh A1', role: 'shore', x: 1, y: 1 },
          { role: 'boundary', x: 2, y: 1 },
          { x: 2, y: 2 },
        ],
      }),
    ], {
      heightPercent: 6,
      mode: 'shoreline',
      widthPercent: 10,
    })

    expect(getTournamentSectorAlignmentReferenceShapes(tournament, [shoreline]).map((shape) => shape.id)).toEqual(['shoreline'])
    expect(result.updatedCount).toBe(1)
    expect(result.shapes.find((shape) => shape.id === 'legacy-a1')).toMatchObject({
      points: [
        { label: 'Breh A1', role: 'shore', x: 15, y: 20 },
        { role: 'boundary', x: 25, y: 20 },
        { x: 25, y: 26 },
        { x: 15, y: 26 },
      ],
    })
  })

  it('uses a generic tournament sector band as shoreline fallback', () => {
    const band = sectorShape({
      id: 'sector-band',
      points: [
        { x: 10, y: 20 },
        { x: 30, y: 20 },
        { x: 30, y: 40 },
        { x: 10, y: 40 },
      ],
      sectorId: undefined,
      tournamentId: 'cup-2026',
    })

    expect(getTournamentSectorAlignmentReferenceShapes(tournament, [band]).map((shape) => shape.id)).toEqual(['sector-band'])
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
