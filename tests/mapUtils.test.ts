import { describe, expect, it } from 'vitest'
import type { LakeSlug, MapFacility, MapLayer, MapShape, Peg, Tournament } from '~/app/data/pond'
import {
  getMapExportFrame,
  getMapLayerImageAttributes,
  getMapQualityIssues,
  getMapQualityIssueSummary,
  normalizeMapLayerImageSettings,
} from '~/app/utils/map'

const testLake: LakeSlug = 'velky-cetin'

function createLayer(overrides: Partial<MapLayer> = {}): MapLayer {
  return {
    editable: true,
    enabled: true,
    id: 'layer-background',
    kind: 'background',
    lake: testLake,
    name: 'Podklad',
    source: '/map.jpg',
    visibility: 'public',
    ...overrides,
  }
}

function createPeg(overrides: Partial<Peg> = {}): Peg {
  return {
    capacity: 2,
    id: 'peg-1',
    label: 'Miesto 1',
    lake: testLake,
    notes: '',
    status: 'free',
    type: 'shore',
    x: 50,
    y: 50,
    ...overrides,
  }
}

function createFacility(overrides: Partial<MapFacility> = {}): MapFacility {
  return {
    id: 'facility-1',
    label: 'Sklad',
    lake: testLake,
    notes: '',
    type: 'storage',
    visibility: 'internal',
    x: 20,
    y: 20,
    ...overrides,
  }
}

function createShape(overrides: Partial<MapShape> = {}): MapShape {
  return {
    id: 'shape-shoreline',
    label: 'Vodná plocha',
    lake: testLake,
    points: [
      { x: 10, y: 10 },
      { x: 80, y: 20 },
      { x: 70, y: 70 },
    ],
    tone: 'water',
    type: 'shoreline',
    visibility: 'public',
    ...overrides,
  }
}

function createTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    dateRange: '1. - 3. máj 2026',
    id: 'cup-2026',
    lake: testLake,
    name: 'Test Cup',
    operationsMode: 'full-dispatch',
    sectors: [
      { id: 'a1', label: 'A1', weightKg: 0, x: 20, y: 30 },
      { id: 'a2', label: 'A2', weightKg: 0, x: 30, y: 30 },
    ],
    status: 'planned',
    ...overrides,
  }
}

describe('map image fitting helpers', () => {
  it('normalizes background fitting settings to editor limits', () => {
    expect(normalizeMapLayerImageSettings({
      fit: 'contain',
      offsetX: 120,
      offsetY: -80,
      opacity: 0.1,
      scale: 4,
    })).toEqual({
      fit: 'contain',
      offsetX: 50,
      offsetY: -50,
      opacity: 0.2,
      scale: 2.5,
    })
  })

  it('converts background fitting settings into SVG image attributes', () => {
    expect(getMapLayerImageAttributes({
      fit: 'stretch',
      offsetX: 5,
      offsetY: -3,
      opacity: 0.8,
      scale: 1.5,
    })).toEqual({
      height: 112.5,
      opacity: 0.8,
      preserveAspectRatio: 'none',
      width: 150,
      x: -20,
      y: -21.75,
    })
  })

  it('computes centered export frames for print aspect presets', () => {
    expect(getMapExportFrame('map-4-3')).toMatchObject({
      height: 75,
      width: 100,
      x: 0,
      y: 0,
    })

    expect(getMapExportFrame('a4-landscape')).toMatchObject({
      height: 70.71,
      width: 100,
      x: 0,
      y: 2.15,
    })

    expect(getMapExportFrame('a4-portrait')).toMatchObject({
      height: 75,
      width: 53.03,
      x: 23.48,
      y: 0,
    })
  })
})

describe('map quality checks', () => {
  it('blocks publishing when a required cabin peg has no cabin product', () => {
    const issues = getMapQualityIssues({
      cabinProducts: [],
      lake: testLake,
      mapFacilities: [],
      mapLayers: [createLayer()],
      mapShapes: [createShape()],
      pegs: [createPeg({
        id: 'cabin-1',
        label: 'Chata 1',
        requiresCabinReservation: true,
        type: 'cabin',
      })],
    })

    expect(issues).toContainEqual(expect.objectContaining({
      id: 'required-cabin-without-product-cabin-1',
      severity: 'error',
    }))
    expect(getMapQualityIssueSummary(issues)).toMatchObject({
      blockingCount: 1,
      errorCount: 1,
    })
  })

  it('reports missing and duplicate tournament sector polygons', () => {
    const tournament = createTournament()
    const issues = getMapQualityIssues({
      focusedTournament: tournament,
      lake: testLake,
      mapFacilities: [],
      mapLayers: [createLayer()],
      mapShapes: [
        createShape(),
        createShape({
          id: 'sector-a1-primary',
          label: 'Sektor A1',
          sectorId: 'a1',
          tone: 'sector',
          tournamentId: tournament.id,
          type: 'sector',
          visibility: 'competition',
        }),
        createShape({
          id: 'sector-a1-copy',
          label: 'Sektor A1 kópia',
          sectorId: 'a1',
          tone: 'sector',
          tournamentId: tournament.id,
          type: 'sector',
          visibility: 'competition',
        }),
      ],
      pegs: [],
    })

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'duplicate-tournament-sector-shape-cup-2026-a1',
        severity: 'error',
      }),
      expect.objectContaining({
        id: 'missing-tournament-sector-shape-cup-2026-a2',
        severity: 'warning',
      }),
    ]))
  })

  it('warns when an enabled public service layer contains internal service points', () => {
    const issues = getMapQualityIssues({
      lake: testLake,
      mapFacilities: [createFacility({ id: 'storage-internal', label: 'Sklad náradia' })],
      mapLayers: [
        createLayer(),
        createLayer({
          id: 'layer-service',
          kind: 'service',
          name: 'Servis',
          visibility: 'public',
        }),
      ],
      mapShapes: [createShape()],
      pegs: [],
    })

    expect(issues).toContainEqual(expect.objectContaining({
      id: 'public-service-layer-with-internal-facilities-velky-cetin',
      severity: 'warning',
    }))
  })
})
