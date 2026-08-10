import type {
  CatchRecord,
  LakeSlug,
  Tournament,
  TournamentCatch,
} from '~/data/pond'
import type { FishObservation } from '~/services/fishRegistryService'
import {
  createDefaultFishRegistrySettings,
  getFishLargeCatchRule,
  type FishRegistrySettings,
} from '~/services/fishRegistrySettingsService'

export interface FishCatchCandidate {
  anglerName: string
  bait: string
  catchId?: string
  caughtAt: string
  id: string
  lake: LakeSlug
  lengthCm: number
  locationLabel: string
  notes: string
  pegId?: string
  sectorId?: string
  source: 'public-catch' | 'tournament'
  species: string
  statusLabel: string
  thresholdKg: number
  tournamentCatchId?: string
  weightKg: number
}

export interface FishCatchCandidateResponse {
  candidates: FishCatchCandidate[]
  ok: true
  settings: FishRegistrySettings
  thresholdKg: number
  updatedAt: string
}

export function createFishCatchCandidates(
  catches: CatchRecord[],
  tournamentCatches: TournamentCatch[],
  tournaments: Tournament[],
  observations: FishObservation[],
  settings = createDefaultFishRegistrySettings(),
): FishCatchCandidate[] {
  const linkedCatchIds = new Set(
    observations.map((observation) => observation.catchId).filter(Boolean),
  )
  const linkedTournamentCatchIds = new Set(
    observations.map((observation) => observation.tournamentCatchId).filter(Boolean),
  )
  const tournamentById = new Map(tournaments.map((tournament) => [tournament.id, tournament]))

  const publicCandidates: FishCatchCandidate[] = catches
    .flatMap((catchItem) => {
      const rule = getFishLargeCatchRule(catchItem.lake, settings)
      if (
        !rule?.enabled
        || catchItem.status === 'rejected'
        || catchItem.weightKg < rule.thresholdKg
        || linkedCatchIds.has(catchItem.id)
      ) {
        return []
      }

      return [{
      anglerName: catchItem.angler,
      bait: catchItem.bait,
      catchId: catchItem.id,
      caughtAt: catchItem.caughtAt,
      id: `public-catch:${catchItem.id}`,
      lake: catchItem.lake,
      lengthCm: catchItem.lengthCm,
      locationLabel: catchItem.pegId,
      notes: catchItem.notes,
      pegId: catchItem.pegId,
      source: 'public-catch',
      species: catchItem.species,
      statusLabel: catchItem.status === 'approved' ? 'schválený úlovok' : 'čaká na schválenie',
      thresholdKg: rule.thresholdKg,
      weightKg: catchItem.weightKg,
      }]
    })

  const tournamentCandidates: FishCatchCandidate[] = tournamentCatches
    .filter((catchItem) =>
      catchItem.status !== 'disputed'
      && !linkedTournamentCatchIds.has(catchItem.id),
    )
    .flatMap((catchItem) => {
      const tournament = tournamentById.get(catchItem.tournamentId)
      if (!tournament) return []
      const rule = getFishLargeCatchRule(tournament.lake, settings)
      if (!rule?.enabled || catchItem.weightKg < rule.thresholdKg) return []
      const sector = tournament.sectors.find((item) => item.id === catchItem.sectorId)

      return [{
        anglerName: catchItem.team,
        bait: '',
        caughtAt: catchItem.caughtAt,
        id: `tournament:${catchItem.id}`,
        lake: tournament.lake,
        lengthCm: catchItem.lengthCm,
        locationLabel: `Sektor ${sector?.label ?? catchItem.sectorId.toUpperCase()}`,
        notes: catchItem.notes,
        sectorId: catchItem.sectorId,
        source: 'tournament' as const,
        species: catchItem.species,
        statusLabel: catchItem.status === 'verified' ? 'overené kontrolórom' : 'čaká na kontrolóra',
        thresholdKg: rule.thresholdKg,
        tournamentCatchId: catchItem.id,
        weightKg: catchItem.weightKg,
      }]
    })

  return [...publicCandidates, ...tournamentCandidates]
    .sort((first, second) => second.weightKg - first.weightKg)
}
