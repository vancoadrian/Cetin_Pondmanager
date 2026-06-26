import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { submitTournamentTeamRegistrationDecision } from '~/services/tournamentApiService'
import { requireAdminAccess } from '../../../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../../../utils/localAuditLogStore'
import { readLocalTournamentState, writeLocalTournamentState } from '../../../../../utils/localTournamentStore'

export default defineEventHandler(async (event) => {
  requireAdminAccess(event, { moduleId: 'tournaments', mode: 'full' })

  const registrationId = getRouterParam(event, 'id')
  const state = await readLocalTournamentState()
  const body = await readBody(event)
  const result = submitTournamentTeamRegistrationDecision(
    {
      ...body,
      registrationId,
    },
    state,
  )

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Tournament team registration decision validation failed',
    })
  }

  const storedState = await writeLocalTournamentState(result)
  await appendLocalAuditEvent({
    ...resolveAuditActor(event, {
      actorId: 'admin',
      actorLabel: 'Admin',
      actorRole: 'manager',
    }),
    action: `tournament.team_registration.${result.registration.status}`,
    area: 'tournaments',
    details: {
      assignedSectorId: result.registration.assignedSectorId ?? null,
      preferredSectorId: result.registration.preferredSectorId ?? null,
      status: result.registration.status,
    },
    entityId: result.registration.id,
    entityLabel: result.registration.teamName,
    entityType: 'tournament_team_registration',
    severity: 'info',
    summary: result.message,
    tournamentId: result.registration.tournamentId,
  })
  setResponseStatus(event, result.statusCode)

  return {
    ...result,
    updatedAt: storedState.updatedAt,
  }
})
