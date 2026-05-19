import { defineEventHandler } from 'h3'
import type { ReservationStateResponse } from '~/services/reservationApiService'
import { readLocalReservationState } from '../utils/localReservationStore'

export default defineEventHandler(async (): Promise<ReservationStateResponse> => {
  const state = await readLocalReservationState()

  return {
    ok: true,
    rentalBookings: state.rentalBookings,
    reservations: state.reservations,
    updatedAt: state.updatedAt,
  }
})
