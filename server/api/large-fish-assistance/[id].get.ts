import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import {
  expireLargeFishAssistanceRequests,
  getLargeFishAssistanceRequest,
  type LargeFishAssistancePublicResponse,
} from '~/services/largeFishAssistanceService'
import {
  readLocalLargeFishAssistanceState,
  writeLocalLargeFishAssistanceState,
} from '../../utils/localLargeFishAssistanceStore'

export default defineEventHandler(async (event): Promise<LargeFishAssistancePublicResponse> => {
  const requestId = getRouterParam(event, 'id') ?? ''
  const tokenValue = getQuery(event).token
  const token = typeof tokenValue === 'string' ? tokenValue : ''
  const state = await readLocalLargeFishAssistanceState()
  const normalizedState = expireLargeFishAssistanceRequests(state)
  const changed = normalizedState.requests.some((request, index) =>
    request.status !== state.requests[index]?.status,
  )
  const storedState = changed
    ? await writeLocalLargeFishAssistanceState(normalizedState)
    : state
  const result = getLargeFishAssistanceRequest(requestId, token, normalizedState)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Large fish assistance not found',
    })
  }

  return {
    ...result,
    updatedAt: storedState.updatedAt,
  }
})
