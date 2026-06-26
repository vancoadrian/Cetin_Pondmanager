import { describe, expect, it } from 'vitest'
import type { LakeSlug, MapFacility, MapLayer, MapShape, Peg, Tournament } from '~/app/data/pond'
import {
  createMapLayerDraft,
  formatMapLayerContentSummary,
  getActiveMapLayerPresetId,
  getMapExportFrame,
  getMapLayerImageAttributes,
  getMapLayerContentSummary,
  getMapLayerKindForPegType,
  getMapLayerKindForShapeType,
  getMapLayerPresetLayerIds,
  getMissingMapLayerKinds,
  getMapPublishQualityIssues,
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

describe('map layer presets', () => {
  const presetLayers: MapLayer[] = [
    createLayer({ id: 'layer-background', kind: 'background' }),
    createLayer({ id: 'layer-pegs', kind: 'pegs', name: 'Lovné miesta' }),
    createLayer({ id: 'layer-cabins', kind: 'cabins', name: 'Chaty' }),
    createLayer({ id: 'layer-service', kind: 'service', name: 'Servis' }),
    createLayer({ id: 'layer-sectors', kind: 'sectors', name: 'Sektory' }),
  ]

  it('returns layer ids for a focused service working preset', () => {
    expect(getMapLayerPresetLayerIds(presetLayers, 'service')).toEqual([
      'layer-background',
      'layer-pegs',
      'layer-cabins',
      'layer-service',
    ])
  })

  it('detects active preset from enabled layer ids scoped to the given lake layers', () => {
    expect(getActiveMapLayerPresetId(presetLayers, [
      'layer-background',
      'layer-pegs',
      'layer-cabins',
      'layer-service',
      'other-lake-layer',
    ])).toBe('service')

    expect(getActiveMapLayerPresetId(presetLayers, [
      'layer-background',
      'layer-service',
    ])).toBe('manual')
  })

  it('creates a missing map layer draft for a lake and layer kind', () => {
    expect(createMapLayerDraft('strkovisko-kocka', 'sectors', ['layer-sk-sectors'])).toMatchObject({
      editable: true,
      enabled: true,
      id: 'layer-sk-sectors-2',
      kind: 'sectors',
      lake: 'strkovisko-kocka',
      name: 'Súťažné sektory',
      visibility: 'competition',
    })
  })

  it('detects missing standard or preset layer kinds', () => {
    expect(getMissingMapLayerKinds([
      createLayer({ kind: 'background' }),
      createLayer({ id: 'layer-pegs', kind: 'pegs' }),
      createLayer({ id: 'layer-service', kind: 'service' }),
    ])).toEqual(['cabins', 'sectors'])

    expect(getMissingMapLayerKinds([
      createLayer({ kind: 'background' }),
    ], ['background', 'sectors'])).toEqual(['sectors'])
  })

  it('maps shape types to their editing layers', () => {
    expect(getMapLayerKindForShapeType('shoreline')).toBe('background')
    expect(getMapLayerKindForShapeType('zone')).toBe('background')
    expect(getMapLayerKindForShapeType('sector')).toBe('sectors')
    expect(getMapLayerKindForShapeType('service')).toBe('service')
  })

  it('maps peg types to their editing layers', () => {
    expect(getMapLayerKindForPegType('shore')).toBe('pegs')
    expect(getMapLayerKindForPegType('cabin')).toBe('cabins')
  })

  it('summarizes visible map content by layer kind and lake', () => {
    const pegs = [
      createPeg({ id: 'shore-1', type: 'shore' }),
      createPeg({ id: 'cabin-1', type: 'cabin' }),
      createPeg({ id: 'other-shore', lake: 'strkovisko-kocka', type: 'shore' }),
    ]
    const mapFacilities = [
      createFacility({ id: 'storage-1' }),
      createFacility({ id: 'other-storage', lake: 'strkovisko-kocka' }),
    ]
    const mapShapes = [
      createShape({ id: 'shoreline-1', type: 'shoreline' }),
      createShape({ id: 'zone-1', type: 'zone' }),
      createShape({ id: 'sector-1', type: 'sector' }),
      createShape({ id: 'service-1', type: 'service' }),
      createShape({ id: 'other-sector', lake: 'strkovisko-kocka', type: 'sector' }),
    ]
    const baseInput = {
      lake: testLake,
      mapFacilities,
      mapShapes,
      pegs,
    }

    expect(getMapLayerContentSummary({ ...baseInput, kind: 'background' })).toMatchObject({
      shapeCount: 2,
      totalCount: 2,
    })
    expect(getMapLayerContentSummary({ ...baseInput, kind: 'pegs' })).toMatchObject({
      pegCount: 1,
      totalCount: 1,
    })
    expect(getMapLayerContentSummary({ ...baseInput, kind: 'cabins' })).toMatchObject({
      cabinCount: 1,
      totalCount: 1,
    })
    expect(getMapLayerContentSummary({ ...baseInput, kind: 'service' })).toMatchObject({
      facilityCount: 1,
      shapeCount: 1,
      totalCount: 2,
    })
    expect(getMapLayerContentSummary({ ...baseInput, kind: 'sectors' })).toMatchObject({
      shapeCount: 1,
      totalCount: 1,
    })
  })

  it('formats a layer content summary for admin layer rows', () => {
    expect(formatMapLayerContentSummary({
      cabinCount: 0,
      facilityCount: 0,
      pegCount: 0,
      shapeCount: 0,
      totalCount: 0,
    })).toBe('bez objektov')

    expect(formatMapLayerContentSummary({
      cabinCount: 2,
      facilityCount: 5,
      pegCount: 1,
      shapeCount: 3,
      totalCount: 11,
    })).toBe('1 miesto · 2 chaty · 5 bodov · 3 plochy')
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
      target: { id: 'cabin-1', kind: 'peg', lake: testLake },
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
        target: expect.objectContaining({ id: 'sector-a1-primary', kind: 'shape', lake: testLake }),
      }),
      expect.objectContaining({
        id: 'missing-tournament-sector-shape-cup-2026-a2',
        severity: 'warning',
        target: expect.objectContaining({ kind: 'tournamentSector', lake: testLake, sectorId: 'a2' }),
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
      target: { id: 'storage-internal', kind: 'facility', lake: testLake },
    }))
  })

  it('warns when cabin pegs exist but the cabins layer is missing', () => {
    const issues = getMapQualityIssues({
      cabinProducts: [{
        id: 'cabin-product-1',
        label: 'Chata pri vode',
        pegIds: ['cabin-1'],
      }],
      lake: testLake,
      mapFacilities: [],
      mapLayers: [createLayer()],
      mapShapes: [createShape()],
      pegs: [createPeg({
        id: 'cabin-1',
        label: 'Chata 1',
        type: 'cabin',
      })],
    })

    expect(issues).toContainEqual(expect.objectContaining({
      actionLabel: 'Doplniť chýbajúcu vrstvu',
      id: 'layer-not-visible-cabins-velky-cetin',
      severity: 'warning',
      target: { action: 'openLayers', kind: 'lake', lake: testLake },
    }))
  })

  it('warns when sector shapes exist but the sectors layer is disabled', () => {
    const issues = getMapQualityIssues({
      enabledLayerIds: ['layer-background'],
      lake: testLake,
      mapFacilities: [],
      mapLayers: [
        createLayer(),
        createLayer({
          enabled: false,
          id: 'layer-sectors',
          kind: 'sectors',
          name: 'Sektory',
          visibility: 'competition',
        }),
      ],
      mapShapes: [
        createShape(),
        createShape({
          id: 'sector-a1',
          label: 'Sektor A1',
          tone: 'sector',
          type: 'sector',
          visibility: 'competition',
        }),
      ],
      pegs: [],
    })

    expect(issues).toContainEqual(expect.objectContaining({
      actionLabel: 'Zapnúť vrstvu alebo vybrať pracovný režim',
      id: 'layer-not-visible-sectors-velky-cetin',
      severity: 'warning',
      target: { id: 'layer-sectors', kind: 'layer', lake: testLake },
    }))
  })

  it('checks publish map quality per lake instead of accepting one shoreline for every lake', () => {
    const issues = getMapPublishQualityIssues({
      mapFacilities: [],
      mapLayers: [
        createLayer(),
        createLayer({
          id: 'layer-sk-background',
          lake: 'strkovisko-kocka',
          source: '/kocka.jpg',
        }),
      ],
      mapShapes: [createShape()],
      pegs: [],
    })

    expect(issues).toContainEqual(expect.objectContaining({
      id: 'missing-public-shoreline-strkovisko-kocka',
      severity: 'info',
      target: { action: 'createShoreline', kind: 'lake', lake: 'strkovisko-kocka' },
    }))
  })

  it('checks tournament sector coverage across all tournaments before publishing', () => {
    const tournament = createTournament()
    const issues = getMapPublishQualityIssues({
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
          label: 'Sektor A1 duplicitne',
          sectorId: 'a1',
          tone: 'sector',
          tournamentId: tournament.id,
          type: 'sector',
          visibility: 'competition',
        }),
      ],
      pegs: [],
      tournaments: [tournament],
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
})
