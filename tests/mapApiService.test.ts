import { describe, expect, it } from 'vitest'
import { mapFacilities, mapLayers, mapShapes, pegs } from '~/app/data/pond'
import { getMapDraftChangeSummary, saveMapState } from '~/app/services/mapApiService'

const currentState = {
  mapFacilities,
  mapLayers,
  mapShapes,
  pegs,
}

describe('getMapDraftChangeSummary', () => {
  it('counts added, updated and removed map entities against the published state', () => {
    const summary = getMapDraftChangeSummary(
      {
        mapFacilities: [
          ...mapFacilities,
          {
            id: 'facility-diff-test',
            lake: 'velky-cetin',
            label: 'Diff test sklad',
            notes: 'Nový interný bod.',
            type: 'storage',
            visibility: 'internal',
            x: 10,
            y: 10,
          },
        ],
        mapLayers: mapLayers.map((layer) =>
          layer.id === 'layer-vc-background'
            ? {
                ...layer,
                imageSettings: {
                  fit: 'contain',
                  offsetX: 4,
                  offsetY: 0,
                  opacity: 0.9,
                  scale: 1.1,
                },
              }
            : layer,
        ),
        mapShapes: mapShapes.filter((shape) => shape.id !== mapShapes[0]!.id),
        pegs: pegs.map((peg) => peg.id === 'vc-03' ? { ...peg, x: peg.x + 1 } : peg),
      },
      currentState,
    )

    expect(summary.mapFacilities.added).toBe(1)
    expect(summary.mapFacilities.addedItems).toContainEqual({
      id: 'facility-diff-test',
      label: 'Diff test sklad',
    })
    expect(summary.mapLayers.updated).toBe(1)
    expect(summary.mapLayers.updatedItems[0]?.label).toBe('Podklad jazera')
    expect(summary.mapShapes.removed).toBe(1)
    expect(summary.mapShapes.removedItems[0]?.id).toBe(mapShapes[0]!.id)
    expect(summary.pegs.updated).toBe(1)
    expect(summary.pegs.updatedItems).toContainEqual({
      id: 'vc-03',
      label: 'Chata 3',
    })
    expect(summary.total).toBe(4)
  })
})

describe('saveMapState', () => {
  it('persists validated editable map point fields and layer visibility', () => {
    const result = saveMapState(
      {
        enabledLayerIds: ['layer-vc-background', 'layer-vc-pegs'],
        mapFacilities,
        mapShapes,
        pegs: pegs.map((peg) =>
          peg.id === 'vc-03'
            ? {
                ...peg,
                capacity: 4,
                label: 'Chata 3 upravená',
                requiresCabinReservation: true,
                type: 'cabin',
                x: 22.5,
                y: 63.1,
              }
            : peg,
        ),
      },
      currentState,
      '2026-05-17T10:00:00.000Z',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Map save should be valid.')

    const updatedPeg = result.pegs.find((peg) => peg.id === 'vc-03')
    expect(updatedPeg).toMatchObject({
      capacity: 4,
      label: 'Chata 3 upravená',
      requiresCabinReservation: true,
      x: 22.5,
      y: 63.1,
    })
    expect(result.mapLayers.find((layer) => layer.id === 'layer-vc-cabins')?.enabled).toBe(false)
    expect(result.updatedAt).toBe('2026-05-17T10:00:00.000Z')
  })

  it('persists background image fit settings for known map layers', () => {
    const result = saveMapState(
      {
        enabledLayerIds: mapLayers.map((layer) => layer.id),
        mapFacilities,
        mapLayers: mapLayers.map((layer) =>
          layer.id === 'layer-vc-background'
            ? {
                ...layer,
                imageSettings: {
                  fit: 'contain',
                  offsetX: 8,
                  offsetY: -4,
                  opacity: 0.75,
                  scale: 1.2,
                },
              }
            : layer,
        ),
        mapShapes,
        pegs,
      },
      currentState,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Map layer settings should be valid.')

    expect(result.mapLayers.find((layer) => layer.id === 'layer-vc-background')?.imageSettings).toMatchObject({
      fit: 'contain',
      offsetX: 8,
      offsetY: -4,
      opacity: 0.75,
      scale: 1.2,
    })
  })

  it('accepts newly created valid map layers in the draft payload', () => {
    const newLayer = {
      editable: true,
      enabled: true,
      id: 'layer-sk-sectors',
      kind: 'sectors',
      lake: 'strkovisko-kocka',
      name: 'Súťažné sektory',
      visibility: 'competition',
    } as const
    const result = saveMapState(
      {
        enabledLayerIds: [...mapLayers.map((layer) => layer.id), newLayer.id],
        mapFacilities,
        mapLayers: [...mapLayers, newLayer],
        mapShapes,
        pegs,
      },
      currentState,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('New map layer should be accepted.')

    expect(result.mapLayers).toContainEqual(newLayer)
    expect(getMapDraftChangeSummary(result, currentState).mapLayers.addedItems).toContainEqual({
      id: newLayer.id,
      label: newLayer.name,
    })
  })

  it('removes cabin-only reservation rules from shore points', () => {
    const result = saveMapState(
      {
        enabledLayerIds: mapLayers.map((layer) => layer.id),
        mapFacilities,
        mapShapes,
        pegs: pegs.map((peg) =>
          peg.id === 'vc-04'
            ? {
                ...peg,
                requiresCabinReservation: true,
                type: 'shore',
              }
            : peg,
        ),
      },
      currentState,
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Shore point should reject cabin-only rule.')

    expect(result.messages).toContain('Brehové miesto nemôže vyžadovať rezerváciu chaty.')
  })

  it('persists newly drawn pegs, facilities and shapes', () => {
    const result = saveMapState(
      {
        enabledLayerIds: mapLayers.map((layer) => layer.id),
        mapFacilities: [
          ...mapFacilities,
          {
            id: 'facility-vc-new-entry',
            lake: 'velky-cetin',
            label: 'Nový vjazd',
            notes: 'Nový vstup do areálu.',
            type: 'entry',
            visibility: 'public',
            x: 12,
            y: 69,
          },
        ],
        mapShapes: [
          ...mapShapes,
          {
            id: 'shape-vc-new-sector',
            lake: 'velky-cetin',
            label: 'Nový sektor',
            points: [
              { x: 22, y: 30 },
              { x: 36, y: 31 },
              { x: 34, y: 42 },
            ],
            tone: 'sector',
            type: 'sector',
            visibility: 'competition',
          },
        ],
        pegs: [
          ...pegs,
          {
            capacity: 2,
            id: 'peg-vc-new-shore',
            lake: 'velky-cetin',
            label: 'Nové miesto',
            notes: 'Miesto vytvorené editorom.',
            status: 'free',
            type: 'shore',
            x: 20,
            y: 20,
          },
        ],
      },
      currentState,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('New map items should be valid.')

    expect(result.pegs.find((peg) => peg.id === 'peg-vc-new-shore')).toBeTruthy()
    expect(result.mapFacilities.find((facility) => facility.id === 'facility-vc-new-entry')).toBeTruthy()
    expect(result.mapShapes.find((shape) => shape.id === 'shape-vc-new-sector')).toBeTruthy()
  })

  it('allows newly drawn map items and rejects unknown layers', () => {
    const result = saveMapState(
      {
        enabledLayerIds: ['layer-vc-background', 'missing-layer'],
        mapFacilities: [
          ...mapFacilities,
          {
            id: 'facility-vc-new-shower',
            lake: 'velky-cetin',
            label: 'Nové sprchy',
            notes: 'Nový servisný bod.',
            type: 'shower',
            visibility: 'public',
            x: 34,
            y: 68,
          },
        ],
        mapShapes: [
          ...mapShapes,
          {
            id: 'shape-vc-new-ban',
            lake: 'velky-cetin',
            label: 'Dočasný zákaz',
            points: [
              { x: 20, y: 20 },
              { x: 30, y: 20 },
              { x: 30, y: 30 },
            ],
            tone: 'warning',
            type: 'zone',
            visibility: 'internal',
          },
        ],
        pegs: [
          ...pegs,
          {
            capacity: 2,
            id: 'missing-peg',
            label: 'Nový bod mimo editora',
            lake: 'velky-cetin',
            notes: 'Nové miesto pridané v editore.',
            status: 'free',
            type: 'shore',
            x: 20,
            y: 20,
          },
        ],
      },
      currentState,
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Unknown layer should be invalid.')

    expect(result.messages).toContain('Neznáma vrstva mapy: missing-layer.')
  })

  it('rejects duplicate ids in editable map collections', () => {
    const result = saveMapState(
      {
        enabledLayerIds: mapLayers.map((layer) => layer.id),
        mapFacilities,
        mapShapes,
        pegs: [pegs[0]!, pegs[0]!],
      },
      currentState,
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Duplicate ids should be invalid.')

    expect(result.messages).toContain(`Duplicitné lovné miesto na mape: ${pegs[0]!.id}.`)
  })
})
