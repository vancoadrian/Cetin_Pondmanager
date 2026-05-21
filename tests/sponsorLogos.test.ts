import { describe, expect, it } from 'vitest'
import type { Sponsor } from '~/app/data/pond'
import { getSponsorLogo } from '~/app/utils/sponsorLogos'

const sponsor = (overrides: Partial<Sponsor> = {}): Sponsor => ({
  active: true,
  description: 'Partner revíru.',
  id: 'sponsor-test',
  logoText: 'ST',
  name: 'Sponsor Test',
  placement: 'homepage',
  tier: 'main',
  ...overrides,
})

describe('getSponsorLogo', () => {
  it('prefers a placement-specific logo variant', () => {
    const logo = getSponsorLogo(
      sponsor({
        logoUrl: '/api/sponsor-assets/primary',
        logoVariants: [{
          height: 300,
          placementType: 'homepage',
          url: '/api/sponsor-assets/homepage',
          width: 900,
        }],
      }),
      'homepage',
    )

    expect(logo).toMatchObject({
      source: 'variant',
      url: '/api/sponsor-assets/homepage',
      width: 900,
    })
  })

  it('falls back to the primary logo and then to logo text', () => {
    expect(getSponsorLogo(sponsor({ logoUrl: '/api/sponsor-assets/primary' }), 'footer')).toMatchObject({
      source: 'primary',
      url: '/api/sponsor-assets/primary',
    })
    expect(getSponsorLogo(sponsor(), 'footer')).toMatchObject({
      source: 'fallback',
      text: 'ST',
    })
  })
})
