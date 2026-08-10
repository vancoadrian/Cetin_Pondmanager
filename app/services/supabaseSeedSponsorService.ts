import type { Sponsor, Tournament } from '../data/pond'
import { mapBy, rowId, type SeedRow, type SeedValue } from './supabaseSeedShared.ts'

export interface SupabaseSeedSponsorSource {
  sponsors: Sponsor[]
  tournaments: Tournament[]
}

export interface SponsorAssetRef {
  altText: string
  id: string
  metadata: SeedValue
  sponsorId: string
  storagePath: string
}

export interface SupabaseSeedSponsorReferenceIds {
  sponsorAssetIds: Record<string, string>
  sponsorAssetRefs: SponsorAssetRef[]
  sponsorIds: Record<string, string>
}

export function buildSponsorReferenceIds(
  source: Pick<SupabaseSeedSponsorSource, 'sponsors'>,
): SupabaseSeedSponsorReferenceIds {
  const sponsorIds = mapBy(source.sponsors, (sponsor) => sponsor.id, (sponsor) => rowId('sponsors', sponsor.id))
  const sponsorAssetRefs: SponsorAssetRef[] = []
  for (const sponsor of source.sponsors) {
    if (sponsor.logoStoragePath) {
      sponsorAssetRefs.push({
        altText: sponsor.logoFileName ?? `Logo ${sponsor.name}`,
        id: sponsor.logoAssetId ?? sponsor.id,
        metadata: { kind: 'primary' },
        sponsorId: sponsor.id,
        storagePath: sponsor.logoStoragePath,
      })
    }

    if (sponsor.logoSourceStoragePath) {
      sponsorAssetRefs.push({
        altText: sponsor.logoSourceFileName ?? `Zdrojové logo ${sponsor.name}`,
        id: sponsor.logoSourceAssetId ?? `${sponsor.id}-source`,
        metadata: {
          height: sponsor.logoSourceHeight ?? null,
          kind: 'source',
          mimeType: sponsor.logoSourceMimeType ?? null,
          originalFileName: sponsor.logoSourceFileName ?? null,
          width: sponsor.logoSourceWidth ?? null,
        },
        sponsorId: sponsor.id,
        storagePath: sponsor.logoSourceStoragePath,
      })
    }

    for (const variant of sponsor.logoVariants ?? []) {
      if (!variant.storagePath) continue

      sponsorAssetRefs.push({
        altText: variant.fileName ?? `Logo ${sponsor.name} ${variant.placementType}`,
        id: variant.variantId ?? `${sponsor.id}-${variant.placementType}`,
        metadata: {
          cropPreset: variant.cropPreset
            ? {
                focusXPercent: variant.cropPreset.focusXPercent,
                focusYPercent: variant.cropPreset.focusYPercent,
                mode: variant.cropPreset.mode,
                paddingPercent: variant.cropPreset.paddingPercent,
                sourceFileName: variant.cropPreset.sourceFileName ?? null,
                sourceHeight: variant.cropPreset.sourceHeight ?? null,
                sourceWidth: variant.cropPreset.sourceWidth ?? null,
              }
            : null,
          kind: 'variant',
          placementType: variant.placementType,
        },
        sponsorId: sponsor.id,
        storagePath: variant.storagePath,
      })
    }
  }
  const sponsorAssetIds = mapBy(
    sponsorAssetRefs,
    (asset) => asset.id,
    (asset) => rowId('sponsor_assets', asset.id),
  )

  return { sponsorAssetIds, sponsorAssetRefs, sponsorIds }
}

export interface SupabaseSeedSponsorTablesParams {
  sponsorAssetIds: Record<string, string>
  sponsorAssetRefs: SponsorAssetRef[]
  sponsorIds: Record<string, string>
  tournamentIds: Record<string, string>
  venueId: string
}

export function buildSponsorTables(
  source: SupabaseSeedSponsorSource,
  params: SupabaseSeedSponsorTablesParams,
): Record<string, SeedRow[]> {
  const { sponsorAssetIds, sponsorAssetRefs, sponsorIds, tournamentIds, venueId } = params

  return {
    sponsor_assets: sponsorAssetRefs.map((asset) => ({
      alt_text: asset.altText,
      id: sponsorAssetIds[asset.id]!,
      metadata: asset.metadata,
      sponsor_id: sponsorIds[asset.sponsorId]!,
      storage_path: asset.storagePath,
    })),
    sponsor_placements: source.sponsors.map((sponsor) => ({
      active: sponsor.active,
      id: rowId('sponsor_placements', sponsor.id),
      lake_id: null,
      placement: sponsor.placement,
      sponsor_id: sponsorIds[sponsor.id]!,
      tournament_id: sponsor.tournamentId
        ? tournamentIds[sponsor.tournamentId] ?? null
        : sponsor.tier === 'tournament' ? tournamentIds[source.tournaments[0]?.id ?? ''] ?? null : null,
      venue_id: venueId,
    })),
    sponsors: source.sponsors.map((sponsor) => ({
      active: sponsor.active,
      description: sponsor.description,
      id: sponsorIds[sponsor.id]!,
      logo_text: sponsor.logoText,
      name: sponsor.name,
      tier: sponsor.tier,
      venue_id: venueId,
      website: sponsor.website ?? null,
    })),
  }
}
