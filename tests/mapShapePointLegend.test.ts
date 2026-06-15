import { describe, expect, it } from 'vitest'
import type { MapShape } from '~/app/data/pond'
import {
  createMapShapePointLegendCsv,
  filterMapShapePointLegendRows,
  getMapShapePointLegendRows,
  getMapShapePointRoleSummary,
} from '~/app/utils/map'

function shape(overrides: Partial<MapShape> = {}): MapShape {
  return {
    id: 'shape-a',
    lake: 'velky-cetin',
    label: 'Zóna brehu',
    points: [
      { label: 'Severný breh', role: 'shore', x: 10, y: 20 },
      { role: 'boundary', x: 30, y: 20 },
      { role: 'regular', x: 30, y: 30 },
      { x: 10, y: 30 },
    ],
    tone: 'warning',
    type: 'zone',
    visibility: 'internal',
    ...overrides,
  }
}

describe('map shape point legend helpers', () => {
  it('builds legend rows only from named or meaningful polygon points', () => {
    const rows = getMapShapePointLegendRows([
      shape(),
      shape({
        id: 'shape-sector',
        label: 'Sektor A1',
        points: [
          { label: 'Vstup kontrolóra', role: 'entry', x: 45, y: 50 },
          { x: 52, y: 50 },
          { x: 52, y: 58 },
        ],
        type: 'sector',
        visibility: 'competition',
      }),
    ])

    expect(rows).toEqual([
      {
        id: 'shape-a-0',
        label: 'Severný breh',
        pointIndex: 0,
        role: 'shore',
        roleLabel: 'breh',
        shapeId: 'shape-a',
        shapeLabel: 'Zóna brehu',
        shapeType: 'zone',
        visibility: 'internal',
        x: 10,
        y: 20,
      },
      {
        id: 'shape-a-1',
        label: 'hranica',
        pointIndex: 1,
        role: 'boundary',
        roleLabel: 'hranica',
        shapeId: 'shape-a',
        shapeLabel: 'Zóna brehu',
        shapeType: 'zone',
        visibility: 'internal',
        x: 30,
        y: 20,
      },
      {
        id: 'shape-sector-0',
        label: 'Vstup kontrolóra',
        pointIndex: 0,
        role: 'entry',
        roleLabel: 'vstup',
        shapeId: 'shape-sector',
        shapeLabel: 'Sektor A1',
        shapeType: 'sector',
        visibility: 'competition',
        x: 45,
        y: 50,
      },
    ])
  })

  it('summarizes legend rows by point role', () => {
    const rows = getMapShapePointLegendRows([
      shape(),
      shape({
        id: 'shape-b',
        points: [
          { label: 'Druhá kotva', role: 'anchor', x: 12, y: 18 },
          { label: 'Breh bez roly', x: 16, y: 18 },
          { x: 18, y: 18 },
        ],
      }),
    ])

    expect(getMapShapePointRoleSummary(rows)).toEqual([
      { count: 1, label: 'kotva podkladu', role: 'anchor' },
      { count: 1, label: 'hranica', role: 'boundary' },
      { count: 1, label: 'bežný bod', role: 'regular' },
      { count: 1, label: 'breh', role: 'shore' },
    ])
  })

  it('filters legend rows by role and visibility', () => {
    const rows = getMapShapePointLegendRows([
      shape(),
      shape({
        id: 'shape-sector',
        label: 'Sektor A1',
        points: [
          { label: 'Vstup kontrolóra', role: 'entry', x: 45, y: 50 },
          { label: 'Kotva sektora', role: 'anchor', x: 52, y: 50 },
          { x: 52, y: 58 },
        ],
        type: 'sector',
        visibility: 'competition',
      }),
    ])

    expect(filterMapShapePointLegendRows(rows, { role: 'shore' }).map((row) => row.id)).toEqual(['shape-a-0'])
    expect(filterMapShapePointLegendRows(rows, { visibility: 'competition' }).map((row) => row.id)).toEqual([
      'shape-sector-0',
      'shape-sector-1',
    ])
    expect(filterMapShapePointLegendRows(rows, { role: 'entry', visibility: 'competition' }).map((row) => row.id)).toEqual([
      'shape-sector-0',
    ])
    expect(filterMapShapePointLegendRows(rows, { role: 'all', visibility: 'all' })).toHaveLength(4)
  })

  it('creates a csv export for filtered legend rows', () => {
    const rows = getMapShapePointLegendRows([
      shape({
        id: 'shape-sector',
        label: 'Sektor A1',
        points: [
          { label: 'Vstup, kontrolór', role: 'entry', x: 45, y: 50 },
          { label: 'Kotva sektora', role: 'anchor', x: 52, y: 50 },
          { x: 52, y: 58 },
        ],
        type: 'sector',
        visibility: 'competition',
      }),
    ])

    expect(createMapShapePointLegendCsv(filterMapShapePointLegendRows(rows, { role: 'entry' }))).toBe([
      'ID,Názov bodu,Typ bodu,Plocha,Typ plochy,Viditeľnosť,Vrchol,X,Y',
      'shape-sector-0,"Vstup, kontrolór",vstup,Sektor A1,súťažný sektor,súťažné,1,45,50',
    ].join('\n'))
  })
})
