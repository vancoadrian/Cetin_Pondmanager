import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { createMockPondRepository, createPondSnapshot } from '~/repositories/pondRepository'
import { submitReservationRequest } from '~/services/reservationApiService'
import { createPondService } from '~/services/pondService'
import { resolveAuditActor } from '../utils/auditActor'
import { readLocalCabinCatalogState } from '../utils/localCabinCatalogStore'
import { appendLocalAuditEvent } from '../utils/localAuditLogStore'
import { readLocalClosureState } from '../utils/localClosureStore'
import { readLocalMapState } from '../utils/localMapStore'
import { readLocalPaymentMethodState } from '../utils/localPaymentMethodStore'
import { appendLocalReservation, readLocalReservationState } from '../utils/localReservationStore'
import { readLocalRentalCatalogState } from '../utils/localRentalCatalogStore'
import { tryAppendReservationRequestNotificationBroadcast } from '../utils/reservationNotificationDispatcher'

export default defineEventHandler(async (event) => {
  const [state, cabinCatalogState, closureState, mapState, paymentMethodState, rentalCatalogState] = await Promise.all([
    readLocalReservationState(),
    readLocalCabinCatalogState(),
    readLocalClosureState(),
    readLocalMapState(),
    readLocalPaymentMethodState(),
    readLocalRentalCatalogState(),
  ])
  const service = createPondService(
    createMockPondRepository(
      createPondSnapshot({
        cabinProducts: cabinCatalogState.cabinProducts,
        lakeClosures: closureState.lakeClosures,
        pegs: mapState.pegs,
        paymentMethods: paymentMethodState.paymentMethods,
        rentalBookings: state.rentalBookings,
        rentalItems: rentalCatalogState.rentalItems,
        reservationExtras: rentalCatalogState.reservationExtras,
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
  const notification = await tryAppendReservationRequestNotificationBroadcast({
    lakeName: service.getLakeName(result.reservation.lake),
    pegLabel: service.getPegLabel(result.reservation.pegId),
    reservation: result.reservation,
  })
  await appendLocalAuditEvent({
    ...resolveAuditActor(event),
    action: 'reservation.request.created',
    area: 'reservations',
    details: {
      extraCount: result.reservation.extraIds.length,
      from: result.reservation.from,
      notificationRecipientCount: notification?.broadcast.recipientCount ?? 0,
      notificationStatus: notification?.broadcast.status ?? null,
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
