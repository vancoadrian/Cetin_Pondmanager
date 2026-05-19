import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { createMockPondRepository, createPondSnapshot } from '~/repositories/pondRepository'
import { submitCatchRecord } from '~/services/catchApiService'
import { createPondService } from '~/services/pondService'
import { resolveAuditActor } from '../utils/auditActor'
import { appendLocalAuditEvent } from '../utils/localAuditLogStore'
import { appendLocalCatch, readLocalCatchState } from '../utils/localCatchStore'
import { writeLocalCatchPhotoFile } from '../utils/localCatchPhotoStore'
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
  const result = submitCatchRecord(await readBody(event), catchState, service)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Catch record validation failed',
    })
  }

  if (result.catchPhoto && result.photoUpload) {
    await writeLocalCatchPhotoFile(result.catchPhoto, result.photoUpload)
  }

  await appendLocalCatch(result.catch, result.logbookEntry, result.catchPhoto)
  await appendLocalAuditEvent({
    ...resolveAuditActor(event),
    action: 'catch.record.created',
    area: 'catches',
    details: {
      angler: result.catch.angler,
      bait: result.catch.bait,
      lengthCm: result.catch.lengthCm,
      pegId: result.catch.pegId,
      photoLabel: result.catch.photoLabel,
      photoStoragePath: result.catch.photoStoragePath ?? '',
      released: result.catch.released,
      species: result.catch.species,
      weightKg: result.catch.weightKg,
      weatherCondition: result.catch.weather?.condition ?? null,
      weatherSource: result.catch.weather?.source ?? null,
    },
    entityId: result.catch.id,
    entityLabel: `${result.catch.species} ${result.catch.weightKg} kg`,
    entityType: 'catch_record',
    lake: result.catch.lake,
    summary: `${result.catch.angler} zapísal úlovok ${result.catch.species} ${result.catch.weightKg} kg.`,
  })
  setResponseStatus(event, result.statusCode)

  return {
    catch: result.catch,
    catchPhoto: result.catchPhoto,
    logbookEntry: result.logbookEntry,
    message: result.message,
    ok: result.ok,
    statusCode: result.statusCode,
  }
})
