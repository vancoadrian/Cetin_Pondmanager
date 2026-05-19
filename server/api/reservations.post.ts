import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { createMockPondRepository, createPondSnapshot } from '~/repositories/pondRepository'
import { submitReservationRequest } from '~/services/reservationApiService'
import { createPondService } from '~/services/pondService'
import { resolveAuditActor } from '../utils/auditActor'
import { appendLocalAuditEvent } from '../utils/localAuditLogStore'
import { appendLocalReservation, readLocalReservationState } from '../utils/localReservationStore'

export default defineEventHandler(async (event) => {
  const state = await readLocalReservationState()
  const service = createPondService(
    createMockPondRepository(
      createPondSnapshot({
        rentalBookings: state.rentalBookings,
        reservations: state.reservations,
      }),
    ),
  )
  const result = submitReservationRequest(await readBody(event), service)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Reservation request validation failed',
    })
  }

  await appendLocalReservation(result.reservation, result.rentalBookings)
  await appendLocalAuditEvent({
    ...resolveAuditActor(event),
    action: 'reservation.request.created',
    area: 'reservations',
    details: {
      extraCount: result.reservation.extraIds.length,
      from: result.reservation.from,
      pegId: result.reservation.pegId,
      rentalCount: result.reservation.rentalIds.length,
      to: result.reservation.to,
    },
    entityId: result.reservation.id,
    entityLabel: result.reservation.guest,
    entityType: 'reservation',
    lake: result.reservation.lake,
    summary: `${result.reservation.guest} poslal webovú žiadosť na miesto ${result.reservation.pegId}.`,
  })
  setResponseStatus(event, result.statusCode)

  return result
})
