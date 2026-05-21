import type { Sponsor, SponsorLogoVariant } from '~/data/pond'

export interface SponsorLogoView {
  alt: string
  height?: number
  source: 'fallback' | 'primary' | 'variant'
  text: string
  url?: string
  width?: number
}

export function getSponsorLogo(
  sponsor: Sponsor,
  preferredPlacement: SponsorLogoVariant['placementType'] = sponsor.placementType ?? 'sponsors',
): SponsorLogoView {
  const variant = sponsor.logoVariants?.find((item) => item.placementType === preferredPlacement)
    ?? sponsor.logoVariants?.find((item) => item.placementType === 'sponsors')

  if (variant?.url) {
    return {
      alt: `Logo ${sponsor.name}`,
      height: variant.height,
      source: 'variant',
      text: sponsor.logoText,
      url: variant.url,
      width: variant.width,
    }
  }

  if (sponsor.logoUrl) {
    return {
      alt: `Logo ${sponsor.name}`,
      height: sponsor.logoHeight,
      source: 'primary',
      text: sponsor.logoText,
      url: sponsor.logoUrl,
      width: sponsor.logoWidth,
    }
  }

  return {
    alt: `Logo ${sponsor.name}`,
    source: 'fallback',
    text: sponsor.logoText,
  }
}
