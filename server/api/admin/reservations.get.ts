import { defineEventHandler } from 'h3'
import type { ReservationStateResponse } from '~/services/reservationApiService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import { readLocalReservationState } from '../../utils/localReservationStore'

export default defineEventHandler(async (event): Promise<ReservationStateResponse> => {
  requireAdminAccess(event, { moduleId: 'reservations' })

  const state = await readLocalReservationState()

  return {
    ok: true,
    rentalBookings: state.rentalBookings,
    reservations: state.reservations,
    updatedAt: state.updatedAt,
  }
})
