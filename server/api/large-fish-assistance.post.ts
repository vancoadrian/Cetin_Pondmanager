import { randomBytes } from 'node:crypto'
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { createMockPondRepository, createPondSnapshot } from '~/repositories/pondRepository'
import { submitLargeFishAssistanceRequest } from '~/services/largeFishAssistanceService'
import { createPondService } from '~/services/pondService'
import { resolveAuditActor } from '../utils/auditActor'
import { tryAppendLargeFishAssistanceNotification } from '../utils/largeFishAssistanceNotificationDispatcher'
import { appendLocalAuditEvent } from '../utils/localAuditLogStore'
import {
  readLocalLargeFishAssistanceState,
  writeLocalLargeFishAssistanceState,
} from '../utils/localLargeFishAssistanceStore'
import { readLocalFishRegistryState } from '../utils/localFishRegistryStore'
import { readLocalMapState } from '../utils/localMapStore'

export default defineEventHandler(async (event) => {
  const [state, fishRegistryState, mapState] = await Promise.all([
    readLocalLargeFishAssistanceState(),
    readLocalFishRegistryState(),
    readLocalMapState(),
  ])
  const service = createPondService(
    createMockPondRepository(
      createPondSnapshot({
        mapFacilities: mapState.mapFacilities,
        pegs: mapState.pegs,
      }),
    ),
  )
  const result = submitLargeFishAssistanceRequest(
    await readBody(event),
    state,
    fishRegistryState.settings,
    randomBytes(18).toString('base64url'),
    service,
  )

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Large fish assistance validation failed',
    })
  }

  await writeLocalLargeFishAssistanceState({ requests: result.requests })
  await appendLocalAuditEvent({
    ...resolveAuditActor(event, {
      actorId: 'public-angler',
      actorLabel: result.request.anglerName,
      actorRole: 'angler',
    }),
    action: 'fish.assistance.requested',
    area: 'fish',
    details: {
      phone: result.request.phone,
      status: result.request.status,
      weightKg: result.request.weightKg,
    },
    entityId: result.request.id,
    entityLabel: `${result.request.weightKg} kg · ${result.request.pegLabel}`,
    entityType: 'large_fish_assistance',
    lake: result.request.lake,
    severity: 'warning',
    summary: `${result.request.anglerName} privolal správcu k rybe ${result.request.weightKg} kg na mieste ${result.request.pegLabel}.`,
  })

  const notification = await tryAppendLargeFishAssistanceNotification(result.request)
  if (notification) {
    await appendLocalAuditEvent({
      actorId: 'system',
      actorLabel: 'Privolanie správcu',
      actorRole: 'system',
      action: 'notification.fish_assistance.created',
      area: 'fish',
      details: {
        broadcastId: notification.broadcast.id,
        recipientCount: notification.broadcast.recipientCount,
        requestId: result.request.id,
      },
      entityId: notification.broadcast.id,
      entityLabel: notification.broadcast.title,
      entityType: 'notification_broadcast',
      lake: result.request.lake,
      severity: 'warning',
      summary: `Systém odoslal internú notifikáciu k privolaniu ${result.request.id}.`,
    })
  }

  setResponseStatus(event, result.statusCode)
  return result
})
