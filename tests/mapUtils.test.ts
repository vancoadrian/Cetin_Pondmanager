import { describe, expect, it } from 'vitest'
import {
  getMapLayerImageAttributes,
  normalizeMapLayerImageSettings,
} from '~/app/utils/map'

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
})
