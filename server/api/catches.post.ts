import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { createMockPondRepository, createPondSnapshot } from '~/repositories/pondRepository'
import { submitCatchRecord } from '~/services/catchApiService'
import { createPondService } from '~/services/pondService'
import { resolveAuditActor } from '../utils/auditActor'
import { tryAppendLargeCatchNotificationBroadcast } from '../utils/largeCatchNotificationDispatcher'
import { appendLocalAuditEvent } from '../utils/localAuditLogStore'
import { appendLocalCatch, readLocalCatchState } from '../utils/localCatchStore'
import { writeLocalCatchPhotoFile } from '../utils/localCatchPhotoStore'
import { readLocalFishRegistryState } from '../utils/localFishRegistryStore'
import { readLocalLargeFishAssistanceState } from '../utils/localLargeFishAssistanceStore'
import { readLocalMapState } from '../utils/localMapStore'

export default defineEventHandler(async (event) => {
  const [catchState, fishRegistryState, assistanceState, mapState] = await Promise.all([
    readLocalCatchState(),
    readLocalFishRegistryState(),
    readLocalLargeFishAssistanceState(),
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
  const notification = await tryAppendLargeCatchNotificationBroadcast({
    assistanceRequests: assistanceState.requests,
    catchRecord: result.catch,
    fishRegistrySettings: fishRegistryState.settings,
    pegLabel: service.getPegLabel(result.catch.pegId),
  })
  if (notification) {
    await appendLocalAuditEvent({
      actorId: 'system',
      actorLabel: 'Evidencia úlovkov',
      actorRole: 'system',
      action: 'notification.large_catch.created',
      area: 'catches',
      details: {
        broadcastId: notification.broadcast.id,
        catchId: result.catch.id,
        recipientCount: notification.broadcast.recipientCount,
      },
      entityId: notification.broadcast.id,
      entityLabel: notification.broadcast.title,
      entityType: 'notification_broadcast',
      lake: result.catch.lake,
      severity: 'warning',
      summary: `Systém pripravil internú notifikáciu k veľkému úlovku ${result.catch.id}.`,
    })
  }
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
