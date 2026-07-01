import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import {
  updateRentalCatalogSettings,
  type RentalCatalogMutationSuccess,
} from '~/services/rentalCatalogService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../utils/auditActor'
import { appendLocalAuditEvent } from '../../utils/localAuditLogStore'
import { readLocalRentalCatalogState, writeLocalRentalCatalogState } from '../../utils/localRentalCatalogStore'
import { readLocalReservationState } from '../../utils/localReservationStore'

export default defineEventHandler(async (event): Promise<RentalCatalogMutationSuccess> => {
  requireAdminAccess(event, { moduleId: 'rentals', mode: 'operate' })

  const [state, reservationState] = await Promise.all([
    readLocalRentalCatalogState(),
    readLocalReservationState(),
  ])
  const result = updateRentalCatalogSettings(await readBody(event), {
    rentalBookings: reservationState.rentalBookings,
    rentalItems: state.rentalItems,
    reservations: reservationState.reservations,
    reservationExtras: state.reservationExtras,
  })

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Rental catalog validation failed',
    })
  }

  const updatedState = await writeLocalRentalCatalogState({
    rentalItems: result.rentalItems,
    reservationExtras: result.reservationExtras,
  })
  await appendLocalAuditEvent({
    ...resolveAuditActor(event, {
      actorId: 'admin',
      actorLabel: 'Admin',
      actorRole: 'manager',
    }),
    action: 'rental_catalog.updated',
    area: 'rentals',
    details: {
      activeExtraIds: updatedState.reservationExtras.filter((extra) => extra.active).map((extra) => extra.id),
      activeRentalItemIds: updatedState.rentalItems.filter((item) => item.active).map((item) => item.id),
      removedRentalItemIds: result.removedRentalItemIds,
      removedReservationExtraIds: result.removedReservationExtraIds,
      totalStock: updatedState.rentalItems.reduce((sum, item) => sum + item.stock, 0),
    },
    entityId: 'rental-catalog',
    entityLabel: 'Požičovňa a doplnky',
    entityType: 'rental_catalog',
    severity: 'info',
    summary: 'Správca upravil katalóg požičovne a doplnkov.',
  })
  setResponseStatus(event, result.statusCode)

  return {
    ...result,
    rentalItems: updatedState.rentalItems,
    reservationExtras: updatedState.reservationExtras,
  }
})
