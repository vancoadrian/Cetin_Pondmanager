import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { submitTournamentRuleCheck } from '~/services/tournamentApiService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import { readLocalTournamentState, writeLocalTournamentState } from '../../../utils/localTournamentStore'

export default defineEventHandler(async (event) => {
  requireAdminAccess(event, { moduleId: 'tournaments', mode: 'operate' })

  const state = await readLocalTournamentState()
  const result = submitTournamentRuleCheck(await readBody(event), state)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Tournament rule check validation failed',
    })
  }

  await writeLocalTournamentState(result)
  await appendLocalAuditEvent({
    ...resolveAuditActor(event, {
      actorId: 'admin',
      actorLabel: 'Admin',
      actorRole: 'manager',
    }),
    action: 'tournament.rule_check.created',
    area: 'tournaments',
    details: {
      marshalId: result.check.marshalId,
      result: result.check.result,
      sectorId: result.check.sectorId,
    },
    entityId: result.check.id,
    entityLabel: result.check.sectorId.toUpperCase(),
    entityType: 'tournament_rule_check',
    severity: result.check.result === 'ok' ? 'info' : 'warning',
    summary: result.check.note,
    tournamentId: result.check.tournamentId,
  })
  setResponseStatus(event, result.statusCode)

  return result
})
