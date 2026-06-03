import type { Sponsor, SponsorLogoVariant } from '~/data/pond'

export interface SponsorPlacementContext {
  placementType: SponsorLogoVariant['placementType']
  sectorId?: string
  tournamentId?: string
}

function sponsorMatchesTarget(sponsor: Sponsor, context: SponsorPlacementContext) {
  if (!sponsor.active) return false
  if (sponsor.tournamentId && sponsor.tournamentId !== context.tournamentId) return false
  if (sponsor.sectorId && context.sectorId && sponsor.sectorId !== context.sectorId) return false

  return true
}

export function getSponsorsForPlacement(
  sponsors: Sponsor[],
  context: SponsorPlacementContext,
) {
  return sponsors
    .filter((sponsor) =>
      sponsor.placementType === context.placementType
      && sponsorMatchesTarget(sponsor, context),
    )
    .sort((first, second) =>
      (first.sortOrder ?? 999) - (second.sortOrder ?? 999)
      || first.name.localeCompare(second.name, 'sk'),
    )
}

export function getSponsorsForPlacementWithFallback(
  sponsors: Sponsor[],
  context: SponsorPlacementContext,
  fallbackContexts: SponsorPlacementContext[],
) {
  const primarySponsors = getSponsorsForPlacement(sponsors, context)
  if (primarySponsors.length > 0) return primarySponsors

  return fallbackContexts.flatMap((fallbackContext) =>
    getSponsorsForPlacement(sponsors, fallbackContext),
  )
}
