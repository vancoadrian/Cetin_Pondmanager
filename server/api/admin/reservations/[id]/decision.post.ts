import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { submitReservationDecision } from '~/services/reservationApiService'
import {
  deliverReservationCommunicationDraft,
  type ReservationDecisionMode,
} from '~/services/reservationWorkflowService'
import { requireAdminAccess } from '../../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../../utils/localAuditLogStore'
import {
  readLocalReservationState,
  writeLocalReservationState,
} from '../../../../utils/localReservationStore'

export default defineEventHandler(async (event) => {
  requireAdminAccess(event, { moduleId: 'reservations', mode: 'operate' })

  const reservationId = getRouterParam(event, 'id') ?? ''
  const body = await readBody(event)
  const state = await readLocalReservationState()
  const result = submitReservationDecision({
    ...body,
    reservationId,
  }, state)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Reservation decision validation failed',
    })
  }

  await writeLocalReservationState({
    rentalBookings: result.rentalBookings,
    reservations: result.reservations,
  })

  const decisionMode = (body as { decisionMode: ReservationDecisionMode }).decisionMode
  const communicationDelivery = await deliverReservationCommunicationDraft(
    result.communicationDraft,
    {
      decisionMode,
      reservationId: result.reservation.id,
    },
  )

  await appendLocalAuditEvent({
    ...resolveAuditActor(event, {
      actorId: 'admin',
      actorLabel: 'Admin',
      actorRole: 'manager',
    }),
    action: `reservation.decision.${result.reservation.status}`,
    area: 'reservations',
    details: {
      from: result.reservation.from,
      hasContactEmail: Boolean(result.reservation.contactEmail),
      notificationDeliveryProvider: communicationDelivery?.provider ?? null,
      notificationDeliveryStatus: communicationDelivery?.status ?? null,
      notificationChannel: result.communicationDraft?.channel ?? null,
      note: result.reservation.internalNote,
      pegId: result.reservation.pegId,
      status: result.reservation.status,
      to: result.reservation.to,
    },
    entityId: result.reservation.id,
    entityLabel: result.reservation.guest,
    entityType: 'reservation',
    lake: result.reservation.lake,
    severity: result.reservation.status === 'blocked' ? 'warning' : 'info',
    summary: `Rezervácia ${result.reservation.guest} je v stave ${result.reservation.status}.`,
  })
  setResponseStatus(event, result.statusCode)

  return {
    ...result,
    communicationDelivery,
  }
})
