import { sponsorLogoPlacementRules } from '~/schemas/pondSchemas'
import type { SponsorLogoVariant } from '~/data/pond'

export type SponsorLogoVariantMode = 'contain' | 'cover'

export interface SponsorLogoVariantTarget {
  height: number
  label: string
  placementType: SponsorLogoVariant['placementType']
  ratio: number
  width: number
}

export interface SponsorLogoBox {
  height: number
  width: number
  x: number
  y: number
}

export interface SponsorLogoDrawBox {
  destination: SponsorLogoBox
  source: SponsorLogoBox
}

export interface SponsorLogoFocusPoint {
  x: number
  y: number
}

export interface SponsorLogoFocusPercent {
  x: number
  y: number
}

export const sponsorLogoVariantPlacementOrder: SponsorLogoVariant['placementType'][] = [
  'homepage',
  'footer',
  'sponsors',
  'tournament',
  'sector',
  'scoreboard',
]

export function getSponsorLogoVariantTargets(
  placements: SponsorLogoVariant['placementType'][] = sponsorLogoVariantPlacementOrder,
): SponsorLogoVariantTarget[] {
  return placements.map((placementType) => {
    const rule = sponsorLogoPlacementRules[placementType]

    return {
      height: rule.minHeight,
      label: rule.label,
      placementType,
      ratio: rule.minWidth / rule.minHeight,
      width: rule.minWidth,
    }
  })
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function normalizeSponsorLogoFocusPercent(
  focus: SponsorLogoFocusPercent,
  step = 5,
): SponsorLogoFocusPercent {
  const safeStep = step > 0 ? step : 1

  return {
    x: clamp(Math.round(focus.x / safeStep) * safeStep, 0, 100),
    y: clamp(Math.round(focus.y / safeStep) * safeStep, 0, 100),
  }
}

export function calculateSponsorLogoDrawBox(
  source: { height: number, width: number },
  target: { height: number, width: number },
  mode: SponsorLogoVariantMode = 'contain',
  paddingRatio = 0.08,
  focus: SponsorLogoFocusPoint = { x: 0.5, y: 0.5 },
): SponsorLogoDrawBox {
  const boundedPadding = Math.max(0, Math.min(0.3, paddingRatio))
  const boundedFocus = {
    x: clamp(focus.x, 0, 1),
    y: clamp(focus.y, 0, 1),
  }
  const availableWidth = Math.max(1, target.width * (1 - boundedPadding * 2))
  const availableHeight = Math.max(1, target.height * (1 - boundedPadding * 2))
  const destinationX = (target.width - availableWidth) / 2
  const destinationY = (target.height - availableHeight) / 2

  if (mode === 'cover') {
    const sourceRatio = source.width / source.height
    const destinationRatio = availableWidth / availableHeight
    const sourceBox = sourceRatio > destinationRatio
      ? {
          height: source.height,
          width: source.height * destinationRatio,
          x: clamp(
            source.width * boundedFocus.x - (source.height * destinationRatio) / 2,
            0,
            source.width - source.height * destinationRatio,
          ),
          y: 0,
        }
      : {
          height: source.width / destinationRatio,
          width: source.width,
          x: 0,
          y: clamp(
            source.height * boundedFocus.y - (source.width / destinationRatio) / 2,
            0,
            source.height - source.width / destinationRatio,
          ),
        }

    return {
      destination: {
        height: availableHeight,
        width: availableWidth,
        x: destinationX,
        y: destinationY,
      },
      source: sourceBox,
    }
  }

  const scale = Math.min(availableWidth / source.width, availableHeight / source.height)
  const destinationWidth = source.width * scale
  const destinationHeight = source.height * scale

  return {
    destination: {
      height: destinationHeight,
      width: destinationWidth,
      x: (target.width - destinationWidth) / 2,
      y: (target.height - destinationHeight) / 2,
    },
    source: {
      height: source.height,
      width: source.width,
      x: 0,
      y: 0,
    },
  }
}
