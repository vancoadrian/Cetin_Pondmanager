import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import {
  saveLakeClosure,
  type ClosureMutationSuccess,
} from '~/services/closureApiService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../utils/auditActor'
import { appendLocalAuditEvent } from '../../utils/localAuditLogStore'
import { readLocalClosureState, writeLocalClosureState } from '../../utils/localClosureStore'
import { readLocalMapState } from '../../utils/localMapStore'

export default defineEventHandler(async (event): Promise<ClosureMutationSuccess> => {
  requireAdminAccess(event, { moduleId: 'closures', mode: 'full' })

  const [closureState, mapState] = await Promise.all([
    readLocalClosureState(),
    readLocalMapState(),
  ])
  const result = saveLakeClosure(await readBody(event), closureState, mapState.pegs)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Closure validation failed',
    })
  }

  const storedState = await writeLocalClosureState({
    lakeClosures: result.lakeClosures,
  })
  await appendLocalAuditEvent({
    ...resolveAuditActor(event),
    action: result.statusCode === 201 ? 'closure.created' : 'closure.updated',
    area: 'reservations',
    details: {
      affectsReservations: result.closure.affectsReservations,
      from: result.closure.from,
      pegIds: result.closure.pegIds ?? [],
      reason: result.closure.reason,
      to: result.closure.to,
      visibility: result.closure.visibility,
    },
    entityId: result.closure.id,
    entityLabel: result.closure.title,
    entityType: 'lake_closure',
    lake: result.closure.lake === 'all' ? undefined : result.closure.lake,
    severity: result.closure.affectsReservations ? 'warning' : 'info',
    summary: `Správca uložil uzávierku ${result.closure.title}.`,
  })
  setResponseStatus(event, result.statusCode)

  return {
    ...result,
    lakeClosures: storedState.lakeClosures,
  }
})
