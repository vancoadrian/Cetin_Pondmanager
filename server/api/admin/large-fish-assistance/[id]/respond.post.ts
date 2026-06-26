import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import {
  expireLargeFishAssistanceRequests,
  respondToLargeFishAssistanceRequest,
  type LargeFishAssistanceMutationSuccess,
} from '~/services/largeFishAssistanceService'
import { requireAdminAccess } from '../../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../../utils/localAuditLogStore'
import {
  readLocalLargeFishAssistanceState,
  writeLocalLargeFishAssistanceState,
} from '../../../../utils/localLargeFishAssistanceStore'

export default defineEventHandler(async (event): Promise<LargeFishAssistanceMutationSuccess> => {
  requireAdminAccess(event, { moduleId: 'fish', mode: 'operate' })
  const actor = resolveAuditActor(event)
  const requestId = getRouterParam(event, 'id') ?? ''
  const state = await readLocalLargeFishAssistanceState()
  const normalizedState = expireLargeFishAssistanceRequests(state)
  const result = respondToLargeFishAssistanceRequest(
    requestId,
    await readBody(event),
    normalizedState,
    actor.actorLabel,
  )

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Large fish assistance response failed',
    })
  }

  await writeLocalLargeFishAssistanceState({ requests: result.requests })
  await appendLocalAuditEvent({
    ...actor,
    action: `fish.assistance.${result.request.status}`,
    area: 'fish',
    details: {
      etaMinutes: result.request.etaMinutes ?? null,
      phone: result.request.phone,
      status: result.request.status,
    },
    entityId: result.request.id,
    entityLabel: `${result.request.weightKg} kg · ${result.request.pegLabel}`,
    entityType: 'large_fish_assistance',
    lake: result.request.lake,
    severity: result.request.status === 'release-without-manager' ? 'warning' : 'info',
    summary: `${actor.actorLabel} odpovedal na privolanie ${result.request.id}: ${result.request.responseMessage}`,
  })

  setResponseStatus(event, result.statusCode)
  return result
})
