import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { createMockPondRepository, createPondSnapshot } from '~/repositories/pondRepository'
import {
  submitAdminReservationRequest,
  type ReservationSubmissionSuccess,
} from '~/services/reservationApiService'
import { createPondService } from '~/services/pondService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../utils/auditActor'
import { readLocalCabinCatalogState } from '../../utils/localCabinCatalogStore'
import { appendLocalAuditEvent } from '../../utils/localAuditLogStore'
import { readLocalClosureState } from '../../utils/localClosureStore'
import { readLocalMapState } from '../../utils/localMapStore'
import { readLocalPaymentMethodState } from '../../utils/localPaymentMethodStore'
import { appendLocalReservation, readLocalReservationState } from '../../utils/localReservationStore'
import { readLocalRentalCatalogState } from '../../utils/localRentalCatalogStore'

export default defineEventHandler(async (event): Promise<ReservationSubmissionSuccess> => {
  requireAdminAccess(event, { moduleId: 'reservations', mode: 'operate' })

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
  const result = submitAdminReservationRequest(await readBody(event), service)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Admin reservation validation failed',
    })
  }

  await appendLocalReservation(result.reservation, result.rentalBookings)
  await appendLocalAuditEvent({
    ...resolveAuditActor(event, {
      actorId: 'admin',
      actorLabel: 'Admin',
      actorRole: 'manager',
    }),
    action: result.reservation.status === 'confirmed'
      ? 'reservation.admin.created_confirmed'
      : 'reservation.admin.created_pending',
    area: 'reservations',
    details: {
      extraCount: result.reservation.extraIds.length,
      from: result.reservation.from,
      paymentMethodId: result.reservation.paymentMethodId ?? null,
      pegId: result.reservation.pegId,
      rentalCount: result.reservation.rentalIds.length,
      source: result.reservation.source,
      status: result.reservation.status,
      to: result.reservation.to,
    },
    entityId: result.reservation.id,
    entityLabel: result.reservation.guest,
    entityType: 'reservation',
    lake: result.reservation.lake,
    severity: result.reservation.status === 'confirmed' ? 'info' : 'warning',
    summary: `Správca vytvoril rezerváciu ${result.reservation.guest}.`,
  })
  setResponseStatus(event, result.statusCode)

  return result
})
