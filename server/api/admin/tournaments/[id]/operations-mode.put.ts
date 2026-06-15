import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { updateTournamentOperationsMode } from '~/services/tournamentApiService'
import { getTournamentOperationalCapabilities } from '~/utils/tournamentOperations'
import { requireAdminAccess } from '../../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../../utils/localAuditLogStore'
import { readLocalTournamentState, writeLocalTournamentState } from '../../../../utils/localTournamentStore'

export default defineEventHandler(async (event) => {
  requireAdminAccess(event, { moduleId: 'tournaments', mode: 'operate' })

  const tournamentId = getRouterParam(event, 'id')
  const state = await readLocalTournamentState()
  const body = await readBody(event)
  const result = updateTournamentOperationsMode(
    {
      ...body,
      tournamentId,
    },
    state,
  )

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Tournament operations mode validation failed',
    })
  }

  const storedState = await writeLocalTournamentState(result)
  const capabilities = getTournamentOperationalCapabilities(result.tournament)
  await appendLocalAuditEvent({
    ...resolveAuditActor(event, {
      actorId: 'admin',
      actorLabel: 'Admin',
      actorRole: 'manager',
    }),
    action: 'tournament.operations_mode.updated',
    area: 'tournaments',
    details: {
      allowsMarshalWorkflow: capabilities.allowsMarshalWorkflow,
      allowsTeamRegistration: capabilities.allowsTeamRegistration,
      allowsTeamRequests: capabilities.allowsTeamRequests,
      operationsMode: capabilities.mode,
    },
    entityId: result.tournament.id,
    entityLabel: result.tournament.name,
    entityType: 'tournament',
    severity: 'info',
    summary: `Správca nastavil režim súťaže na ${capabilities.label}.`,
    tournamentId: result.tournament.id,
  })
  setResponseStatus(event, result.statusCode)

  return {
    ...result,
    updatedAt: storedState.updatedAt,
  }
})
