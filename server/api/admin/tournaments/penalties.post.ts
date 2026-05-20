import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { submitTournamentPenalty } from '~/services/tournamentApiService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import { readLocalTournamentState, writeLocalTournamentState } from '../../../utils/localTournamentStore'

export default defineEventHandler(async (event) => {
  requireAdminAccess(event, { moduleId: 'tournaments', mode: 'operate' })

  const state = await readLocalTournamentState()
  const result = submitTournamentPenalty(await readBody(event), state)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Tournament penalty validation failed',
    })
  }

  await writeLocalTournamentState(result)
  await appendLocalAuditEvent({
    ...resolveAuditActor(event, {
      actorId: 'admin',
      actorLabel: 'Admin',
      actorRole: 'manager',
    }),
    action: 'tournament.penalty.created',
    area: 'tournaments',
    details: {
      durationHours: result.penalty.durationHours ?? null,
      rodsLess: result.penalty.rodsLess ?? null,
      sectorId: result.penalty.sectorId,
      status: result.penalty.status,
      type: result.penalty.type,
    },
    entityId: result.penalty.id,
    entityLabel: result.penalty.team,
    entityType: 'tournament_penalty',
    severity: result.penalty.type === 'warning' ? 'warning' : 'critical',
    summary: `${result.penalty.team}: ${result.penalty.reason}`,
    tournamentId: result.penalty.tournamentId,
  })
  setResponseStatus(event, result.statusCode)

  return result
})
