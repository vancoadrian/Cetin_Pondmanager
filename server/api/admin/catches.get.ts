import { defineEventHandler } from 'h3'
import type { CatchStateResponse } from '~/services/catchApiService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import { readLocalCatchState } from '../../utils/localCatchStore'

export default defineEventHandler(async (event): Promise<CatchStateResponse> => {
  requireAdminAccess(event, { moduleId: 'catches' })

  const state = await readLocalCatchState()

  return {
    catchPhotos: state.catchPhotos,
    catches: state.catches,
    ok: true,
    tripLogbookEntries: state.tripLogbookEntries,
    tripLogbooks: state.tripLogbooks,
    updatedAt: state.updatedAt,
  }
})
