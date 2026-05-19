import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { submitCatchModerationDecision } from '~/services/catchModerationService'
import { resolveAuditActor } from '../../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../../utils/localAuditLogStore'
import {
  readLocalCatchState,
  replaceLocalCatchState,
} from '../../../../utils/localCatchStore'

export default defineEventHandler(async (event) => {
  const catchId = getRouterParam(event, 'id') ?? ''
  const body = await readBody(event)
  const state = await readLocalCatchState()
  const actor = resolveAuditActor(event, {
    actorId: 'admin',
    actorLabel: 'Admin',
    actorRole: 'manager',
  })
  const result = submitCatchModerationDecision(
    {
      ...body,
      catchId,
    },
    state,
    actor.actorLabel,
  )

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Catch moderation validation failed',
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
    action: `catch.record.${result.catch.status}`,
    area: 'catches',
    details: {
      angler: result.catch.angler,
      note: result.catch.reviewNote ?? '',
      pegId: result.catch.pegId,
      species: result.catch.species,
      status: result.catch.status,
      weightKg: result.catch.weightKg,
    },
    entityId: result.catch.id,
    entityLabel: `${result.catch.species} ${result.catch.weightKg} kg`,
    entityType: 'catch_record',
    lake: result.catch.lake,
    severity: result.catch.status === 'rejected' ? 'warning' : 'info',
    summary: `Úlovok ${result.catch.species} ${result.catch.weightKg} kg je v stave ${result.catch.status}.`,
  })
  setResponseStatus(event, result.statusCode)

  return result
})
