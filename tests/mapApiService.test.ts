import { describe, expect, it } from 'vitest'
import { mapLayers, mapShapes, pegs } from '~/app/data/pond'
import { saveMapState } from '~/app/services/mapApiService'

const currentState = {
  mapLayers,
  mapShapes,
  pegs,
}

describe('saveMapState', () => {
  it('persists validated editable map point fields and layer visibility', () => {
    const result = saveMapState(
      {
        enabledLayerIds: ['layer-vc-background', 'layer-vc-pegs'],
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

  it('removes cabin-only reservation rules from shore points', () => {
    const result = saveMapState(
      {
        enabledLayerIds: mapLayers.map((layer) => layer.id),
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

  it('rejects unknown map points and layers', () => {
    const result = saveMapState(
      {
        enabledLayerIds: ['layer-vc-background', 'missing-layer'],
        pegs: [
          ...pegs,
          {
            capacity: 2,
            id: 'missing-peg',
            label: 'Nový bod mimo editora',
            type: 'shore',
            x: 20,
            y: 20,
          },
        ],
      },
      currentState,
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Unknown references should be invalid.')

    expect(result.messages).toContain('Neznámy bod mapy: missing-peg.')
    expect(result.messages).toContain('Neznáma vrstva mapy: missing-layer.')
  })
})
