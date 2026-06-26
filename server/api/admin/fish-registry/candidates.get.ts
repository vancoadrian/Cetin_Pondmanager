import { defineEventHandler } from 'h3'
import {
  createFishCatchCandidates,
  FISH_MANAGER_CALL_THRESHOLD_KG,
  type FishCatchCandidateResponse,
} from '~/services/fishRegistryService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { readLocalCatchState } from '../../../utils/localCatchStore'
import { readLocalFishRegistryState } from '../../../utils/localFishRegistryStore'
import { readLocalTournamentState } from '../../../utils/localTournamentStore'

export default defineEventHandler(async (event): Promise<FishCatchCandidateResponse> => {
  requireAdminAccess(event, { moduleId: 'fish' })
  const [catchState, registryState, tournamentState] = await Promise.all([
    readLocalCatchState(),
    readLocalFishRegistryState(),
    readLocalTournamentState(),
  ])

  const activeThresholds = registryState.settings.largeCatchRules
    .filter((rule) => rule.enabled)
    .map((rule) => rule.thresholdKg)

  return {
    candidates: createFishCatchCandidates(
      catchState.catches,
      tournamentState.tournamentCatches,
      tournamentState.tournaments,
      registryState.observations,
      registryState.settings,
    ),
    ok: true,
    settings: registryState.settings,
    thresholdKg: activeThresholds.length > 0
      ? Math.min(...activeThresholds)
      : FISH_MANAGER_CALL_THRESHOLD_KG,
    updatedAt: new Date().toISOString(),
  }
})
