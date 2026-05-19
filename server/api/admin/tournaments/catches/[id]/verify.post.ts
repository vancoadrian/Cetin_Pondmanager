import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { submitTournamentCatchVerification } from '~/services/tournamentApiService'
import { resolveAuditActor } from '../../../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../../../utils/localAuditLogStore'
import { readLocalTournamentState, writeLocalTournamentState } from '../../../../../utils/localTournamentStore'

export default defineEventHandler(async (event) => {
  const catchId = getRouterParam(event, 'id')
  const state = await readLocalTournamentState()
  const body = await readBody(event)
  const result = submitTournamentCatchVerification(
    {
      ...body,
      catchId,
    },
    state,
  )

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Tournament catch verification failed',
    })
  }

  await writeLocalTournamentState(result)
  await appendLocalAuditEvent({
    ...resolveAuditActor(event, {
      actorId: 'admin',
      actorLabel: 'Admin',
      actorRole: 'manager',
    }),
    action: result.catchItem.status === 'disputed'
      ? 'tournament.catch.disputed'
      : 'tournament.catch.verified',
    area: 'tournaments',
    details: {
      lengthCm: result.catchItem.lengthCm,
      sectorId: result.catchItem.sectorId,
      species: result.catchItem.species,
      status: result.catchItem.status,
      verifiedByMarshalId: result.catchItem.verifiedByMarshalId,
      weightKg: result.catchItem.weightKg,
    },
    entityId: result.catchItem.id,
    entityLabel: `${result.catchItem.team} · ${result.catchItem.species}`,
    entityType: 'tournament_catch',
    severity: result.catchItem.status === 'disputed' ? 'warning' : 'info',
    summary: result.message,
    tournamentId: result.catchItem.tournamentId,
  })
  setResponseStatus(event, result.statusCode)

  return result
})
