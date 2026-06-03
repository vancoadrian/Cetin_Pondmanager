import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { updateTournamentSectors } from '~/services/tournamentApiService'
import { requireAdminAccess } from '../../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../../utils/localAuditLogStore'
import { readLocalTournamentState, writeLocalTournamentState } from '../../../../utils/localTournamentStore'

export default defineEventHandler(async (event) => {
  requireAdminAccess(event, { moduleId: 'tournaments', mode: 'operate' })

  const tournamentId = getRouterParam(event, 'id')
  const state = await readLocalTournamentState()
  const body = await readBody(event)
  const result = updateTournamentSectors(
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
      statusMessage: 'Tournament sector settings validation failed',
    })
  }

  const storedState = await writeLocalTournamentState(result)
  await appendLocalAuditEvent({
    ...resolveAuditActor(event, {
      actorId: 'admin',
      actorLabel: 'Admin',
      actorRole: 'manager',
    }),
    action: 'tournament.sectors.updated',
    area: 'tournaments',
    details: {
      sectorCount: result.tournament.sectors.length,
      sectorIds: result.tournament.sectors.map((sector) => sector.id),
      teamCount: result.tournament.sectors.filter((sector) => sector.team).length,
    },
    entityId: result.tournament.id,
    entityLabel: result.tournament.name,
    entityType: 'tournament',
    severity: 'info',
    summary: 'Správca upravil súťažné sektory, tímy alebo priebežné váhy.',
    tournamentId: result.tournament.id,
  })
  setResponseStatus(event, result.statusCode)

  return {
    ...result,
    updatedAt: storedState.updatedAt,
  }
})
