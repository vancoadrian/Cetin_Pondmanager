import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import {
  cancelLargeFishAssistanceRequest,
  type LargeFishAssistanceMutationSuccess,
} from '~/services/largeFishAssistanceService'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import {
  readLocalLargeFishAssistanceState,
  writeLocalLargeFishAssistanceState,
} from '../../../utils/localLargeFishAssistanceStore'

export default defineEventHandler(async (event): Promise<LargeFishAssistanceMutationSuccess> => {
  const requestId = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ token?: string }>(event)
  const state = await readLocalLargeFishAssistanceState()
  const result = cancelLargeFishAssistanceRequest(requestId, body?.token ?? '', state)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Large fish assistance cancellation failed',
    })
  }

  await writeLocalLargeFishAssistanceState({ requests: result.requests })
  await appendLocalAuditEvent({
    action: 'fish.assistance.cancelled',
    actorId: 'public-angler',
    actorLabel: result.request.anglerName,
    actorRole: 'angler',
    area: 'fish',
    details: {
      phone: result.request.phone,
      status: result.request.status,
    },
    entityId: result.request.id,
    entityLabel: `${result.request.weightKg} kg · ${result.request.pegLabel}`,
    entityType: 'large_fish_assistance',
    lake: result.request.lake,
    severity: 'info',
    summary: `${result.request.anglerName} zrušil privolanie správcu na mieste ${result.request.pegLabel}.`,
  })

  setResponseStatus(event, result.statusCode)
  return result
})
