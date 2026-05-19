import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { createMockPondRepository, createPondSnapshot } from '~/repositories/pondRepository'
import { submitTripLogbook } from '~/services/catchApiService'
import { createPondService } from '~/services/pondService'
import { resolveAuditActor } from '../utils/auditActor'
import { appendLocalAuditEvent } from '../utils/localAuditLogStore'
import { appendLocalTripLogbook, readLocalCatchState } from '../utils/localCatchStore'
import { readLocalMapState } from '../utils/localMapStore'

export default defineEventHandler(async (event) => {
  const [catchState, mapState] = await Promise.all([
    readLocalCatchState(),
    readLocalMapState(),
  ])
  const service = createPondService(
    createMockPondRepository(
      createPondSnapshot({
        pegs: mapState.pegs,
      }),
    ),
  )
  const result = submitTripLogbook(await readBody(event), catchState, service)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Trip logbook validation failed',
    })
  }

  await appendLocalTripLogbook(result.logbook)
  await appendLocalAuditEvent({
    ...resolveAuditActor(event),
    action: 'trip_logbook.created',
    area: 'logbooks',
    details: {
      memberCount: result.logbook.members.length,
      mode: result.logbook.mode,
      pegIds: result.logbook.pegIds,
      shareCode: result.logbook.shareCode,
    },
    entityId: result.logbook.id,
    entityLabel: result.logbook.title,
    entityType: 'trip_logbook',
    lake: result.logbook.lake,
    summary: `Vznikol zápisník ${result.logbook.title} s kódom ${result.logbook.shareCode}.`,
  })
  setResponseStatus(event, result.statusCode)

  return result
})
