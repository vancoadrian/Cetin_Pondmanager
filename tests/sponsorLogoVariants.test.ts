import { describe, expect, it } from 'vitest'
import {
  calculateSponsorLogoDrawBox,
  getSponsorLogoVariantTargets,
} from '~/app/utils/sponsorLogoVariants'

describe('sponsor logo variant helpers', () => {
  it('returns deterministic placement target sizes', () => {
    expect(getSponsorLogoVariantTargets().map((target) => ({
      height: target.height,
      placementType: target.placementType,
      width: target.width,
    }))).toEqual([
      { height: 240, placementType: 'homepage', width: 720 },
      { height: 96, placementType: 'footer', width: 240 },
      { height: 140, placementType: 'sponsors', width: 320 },
      { height: 180, placementType: 'tournament', width: 480 },
      { height: 260, placementType: 'sector', width: 260 },
      { height: 220, placementType: 'scoreboard', width: 720 },
    ])
  })

  it('keeps the full source logo visible in contain mode', () => {
    const box = calculateSponsorLogoDrawBox(
      { height: 250, width: 1000 },
      { height: 240, width: 720 },
      'contain',
      0.1,
    )

    expect(box.source).toEqual({
      height: 250,
      width: 1000,
      x: 0,
      y: 0,
    })
    expect(box.destination).toEqual({
      height: 144,
      width: 576,
      x: 72,
      y: 48,
    })
  })

  it('crops the source around the center in cover mode', () => {
    const box = calculateSponsorLogoDrawBox(
      { height: 250, width: 1000 },
      { height: 260, width: 260 },
      'cover',
      0,
    )

    expect(box.destination).toEqual({
      height: 260,
      width: 260,
      x: 0,
      y: 0,
    })
    expect(box.source).toEqual({
      height: 250,
      width: 250,
      x: 375,
      y: 0,
    })
  })

  it('moves a cover crop by focus point and keeps it inside the source image', () => {
    const leftBox = calculateSponsorLogoDrawBox(
      { height: 250, width: 1000 },
      { height: 260, width: 260 },
      'cover',
      0,
      { x: 0.2, y: 0.5 },
    )
    const farRightBox = calculateSponsorLogoDrawBox(
      { height: 250, width: 1000 },
      { height: 260, width: 260 },
      'cover',
      0,
      { x: 2, y: 0.5 },
    )

    expect(leftBox.source.x).toBe(75)
    expect(farRightBox.source.x).toBe(750)
  })
})
