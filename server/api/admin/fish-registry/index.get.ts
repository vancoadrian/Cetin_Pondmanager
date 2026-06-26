import { defineEventHandler } from 'h3'
import type { FishRegistryStateResponse } from '~/services/fishRegistryService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { readLocalFishRegistryState } from '../../../utils/localFishRegistryStore'

export default defineEventHandler(async (event): Promise<FishRegistryStateResponse> => {
  requireAdminAccess(event, { moduleId: 'fish' })
  const state = await readLocalFishRegistryState()

  return {
    fish: state.fish,
    observations: state.observations,
    ok: true,
    settings: state.settings,
    updatedAt: state.updatedAt,
  }
})
