import { defineEventHandler } from 'h3'
import type { ClosureStateResponse } from '~/services/closureApiService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import { readLocalClosureState } from '../../utils/localClosureStore'

export default defineEventHandler(async (event): Promise<ClosureStateResponse> => {
  requireAdminAccess(event, { moduleId: 'closures' })

  const state = await readLocalClosureState()

  return {
    lakeClosures: state.lakeClosures,
    ok: true,
    updatedAt: state.updatedAt,
  }
})
