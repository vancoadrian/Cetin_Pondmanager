import { defineEventHandler } from 'h3'
import type { PlaceIssueStateResponse } from '~/services/placeIssueService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import { readLocalPlaceIssueState } from '../../utils/localPlaceIssueStore'

export default defineEventHandler(async (event): Promise<PlaceIssueStateResponse> => {
  requireAdminAccess(event, { moduleId: 'issues' })

  const state = await readLocalPlaceIssueState()

  return {
    ok: true,
    placeIssues: state.placeIssues,
    updatedAt: state.updatedAt,
  }
})
