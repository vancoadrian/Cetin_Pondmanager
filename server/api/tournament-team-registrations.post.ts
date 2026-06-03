import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { submitTournamentTeamRegistration } from '~/services/tournamentApiService'
import { resolveAuditActor } from '../utils/auditActor'
import { appendLocalAuditEvent } from '../utils/localAuditLogStore'
import {
  appendLocalTournamentTeamRegistration,
  readLocalTournamentState,
} from '../utils/localTournamentStore'

export default defineEventHandler(async (event) => {
  const state = await readLocalTournamentState()
  const result = submitTournamentTeamRegistration(await readBody(event), state)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Tournament team registration validation failed',
    })
  }

  await appendLocalTournamentTeamRegistration(result.registration)
  await appendLocalAuditEvent({
    ...resolveAuditActor(event, {
      actorId: 'public-team-registration',
      actorLabel: result.registration.contactName,
      actorRole: 'tournament_team',
    }),
    action: 'tournament.team_registration.created',
    area: 'tournaments',
    details: {
      contactEmail: result.registration.contactEmail ?? null,
      contactPhone: result.registration.contactPhone,
      memberCount: result.registration.memberCount,
      preferredSectorId: result.registration.preferredSectorId ?? null,
      status: result.registration.status,
    },
    entityId: result.registration.id,
    entityLabel: result.registration.teamName,
    entityType: 'tournament_team_registration',
    severity: 'info',
    summary: `${result.registration.teamName} poslali prihlášku do súťaže.`,
    tournamentId: result.registration.tournamentId,
  })
  setResponseStatus(event, result.statusCode)

  return result
})
