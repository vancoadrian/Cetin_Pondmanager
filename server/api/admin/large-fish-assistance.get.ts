import { defineEventHandler } from 'h3'
import {
  expireLargeFishAssistanceRequests,
  type LargeFishAssistanceStateResponse,
} from '~/services/largeFishAssistanceService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import {
  readLocalLargeFishAssistanceState,
  writeLocalLargeFishAssistanceState,
} from '../../utils/localLargeFishAssistanceStore'

export default defineEventHandler(async (event): Promise<LargeFishAssistanceStateResponse> => {
  requireAdminAccess(event, { moduleId: 'fish' })
  const state = await readLocalLargeFishAssistanceState()
  const normalizedState = expireLargeFishAssistanceRequests(state)
  const changed = normalizedState.requests.some((request, index) =>
    request.status !== state.requests[index]?.status,
  )
  const storedState = changed
    ? await writeLocalLargeFishAssistanceState(normalizedState)
    : state

  return {
    ok: true,
    requests: normalizedState.requests,
    updatedAt: storedState.updatedAt,
  }
})
