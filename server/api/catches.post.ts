import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import type { LakeSlug } from '~/data/pond'
import { createMockPondRepository, createPondSnapshot } from '~/repositories/pondRepository'
import { submitCatchRecord } from '~/services/catchApiService'
import {
  createAsyncCatchWeatherResolver,
  type CatchWeatherLookupInput,
} from '~/services/catchWeatherService'
import { createPondService } from '~/services/pondService'
import { resolveAuditActor } from '../utils/auditActor'
import { tryAppendLargeCatchNotificationBroadcast } from '../utils/largeCatchNotificationDispatcher'
import { appendLocalAuditEvent } from '../utils/localAuditLogStore'
import { appendLocalCatch, readLocalCatchState } from '../utils/localCatchStore'
import { writeLocalCatchPhotoFile } from '../utils/localCatchPhotoStore'
import { readLocalFishRegistryState } from '../utils/localFishRegistryStore'
import { readLocalLargeFishAssistanceState } from '../utils/localLargeFishAssistanceStore'
import { readLocalMapState } from '../utils/localMapStore'

function getWeatherLookupInput(rawBody: unknown): CatchWeatherLookupInput | undefined {
  const body = rawBody as Partial<{
    caughtAt: unknown
    lake: unknown
    pegId: unknown
  }>
  if (
    typeof body.caughtAt === 'string' &&
    (body.lake === 'velky-cetin' || body.lake === 'strkovisko-kocka') &&
    typeof body.pegId === 'string'
  ) {
    return {
      caughtAt: body.caughtAt,
      lake: body.lake as LakeSlug,
      pegId: body.pegId,
    }
  }

  return undefined
}

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
  const body = await readBody(event)
  const weatherLookupInput = getWeatherLookupInput(body)
  const asyncWeatherResolver = createAsyncCatchWeatherResolver()
  const weather = weatherLookupInput ? await asyncWeatherResolver(weatherLookupInput) : undefined
  const result = submitCatchRecord(body, catchState, service, undefined, () => weather)

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
