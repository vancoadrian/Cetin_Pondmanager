import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { createMockPondRepository, createPondSnapshot } from '~/repositories/pondRepository'
import { submitCatchCorrection } from '~/services/catchCorrectionService'
import { createPondService } from '~/services/pondService'
import { resolveAuditActor } from '../../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../../utils/localAuditLogStore'
import {
  readLocalCatchState,
  replaceLocalCatchState,
} from '../../../../utils/localCatchStore'
import { readLocalMapState } from '../../../../utils/localMapStore'

export default defineEventHandler(async (event) => {
  const catchId = getRouterParam(event, 'id') ?? ''
  const body = await readBody(event)
  const [state, mapState] = await Promise.all([
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
  const actor = resolveAuditActor(event, {
    actorId: 'admin',
    actorLabel: 'Admin',
    actorRole: 'manager',
  })
  const result = submitCatchCorrection(
    {
      ...body,
      catchId,
    },
    state,
    service,
  )

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Catch correction validation failed',
    })
  }

  await replaceLocalCatchState({
    catchPhotos: result.catchPhotos,
    catches: result.catches,
    tripLogbookEntries: result.tripLogbookEntries,
    tripLogbooks: result.tripLogbooks,
  })
  await appendLocalAuditEvent({
    ...actor,
    action: 'catch.record.corrected',
    area: 'catches',
    details: {
      angler: result.catch.angler,
      bait: result.catch.bait,
      caughtAt: result.catch.caughtAt,
      lengthCm: result.catch.lengthCm,
      logbookEntryId: result.logbookEntry?.id ?? null,
      logbookId: result.logbookEntry?.logbookId ?? null,
      logbookLinkMode: result.logbookLinkMode,
      pegId: result.catch.pegId,
      released: result.catch.released,
      species: result.catch.species,
      status: result.catch.status,
      weightKg: result.catch.weightKg,
      weatherCondition: result.catch.weather?.condition ?? null,
      weatherSource: result.catch.weather?.source ?? null,
    },
    entityId: result.catch.id,
    entityLabel: `${result.catch.species} ${result.catch.weightKg} kg`,
    entityType: 'catch_record',
    lake: result.catch.lake,
    summary: `Správca opravil údaje úlovku ${result.catch.species} ${result.catch.weightKg} kg.`,
  })
  setResponseStatus(event, result.statusCode)

  return result
})
