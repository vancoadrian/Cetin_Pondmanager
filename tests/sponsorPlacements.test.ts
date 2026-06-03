import { describe, expect, it } from 'vitest'
import type { Sponsor } from '~/app/data/pond'
import {
  getSponsorsForPlacement,
  getSponsorsForPlacementWithFallback,
} from '~/app/utils/sponsorPlacements'

const sponsor = (overrides: Partial<Sponsor> = {}): Sponsor => ({
  active: true,
  description: 'Partner súťaže.',
  id: 'sponsor-test',
  logoText: 'ST',
  name: 'Sponsor Test',
  placement: 'súťaž',
  placementType: 'tournament',
  sortOrder: 10,
  tier: 'tournament',
  ...overrides,
})

describe('sponsor placement helpers', () => {
  it('returns active sponsors for a tournament placement in display order', () => {
    const sponsors = getSponsorsForPlacement([
      sponsor({ id: 'inactive', active: false, sortOrder: 1 }),
      sponsor({ id: 'other-tournament', sortOrder: 2, tournamentId: 'other' }),
      sponsor({ id: 'second', sortOrder: 3, tournamentId: 'eccj-2026' }),
      sponsor({ id: 'first', sortOrder: 1, tournamentId: 'eccj-2026' }),
    ], {
      placementType: 'tournament',
      tournamentId: 'eccj-2026',
    })

    expect(sponsors.map((item) => item.id)).toEqual(['first', 'second'])
  })

  it('matches a sector sponsor only when the requested sector fits', () => {
    const sponsors = [
      sponsor({ id: 'sector-b4', placementType: 'sector', sectorId: 'b4' }),
      sponsor({ id: 'sector-a1', placementType: 'sector', sectorId: 'a1' }),
    ]

    expect(getSponsorsForPlacement(sponsors, {
      placementType: 'sector',
      sectorId: 'b4',
      tournamentId: 'eccj-2026',
    }).map((item) => item.id)).toEqual(['sector-b4'])
  })

  it('uses fallback placements when the primary slot is empty', () => {
    const sponsors = [
      sponsor({ id: 'tournament', placementType: 'tournament', tournamentId: 'eccj-2026' }),
    ]

    expect(getSponsorsForPlacementWithFallback(
      sponsors,
      { placementType: 'scoreboard', tournamentId: 'eccj-2026' },
      [{ placementType: 'tournament', tournamentId: 'eccj-2026' }],
    ).map((item) => item.id)).toEqual(['tournament'])
  })
})
