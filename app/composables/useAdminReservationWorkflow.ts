import type { RentalBooking, Reservation } from '~/data/pond'
import {
  applyReservationDecision,
  cloneReservationWorkflowState,
  getDefaultDecisionMode,
  type ReservationDecisionInput,
} from '~/services/reservationWorkflowService'

export function useAdminReservationWorkflow(
  seedReservations: Reservation[],
  seedRentalBookings: RentalBooking[],
) {
  const initialState = cloneReservationWorkflowState(seedReservations, seedRentalBookings)
  const adminReservations = ref<Reservation[]>(initialState.reservations)
  const adminRentalBookings = ref<RentalBooking[]>(initialState.rentalBookings)
  const workflowMessage = ref('')

  const replaceReservationWorkflowState = (
    nextReservations: Reservation[],
    nextRentalBookings: RentalBooking[],
  ) => {
    const nextState = cloneReservationWorkflowState(nextReservations, nextRentalBookings)
    adminReservations.value = nextState.reservations
    adminRentalBookings.value = nextState.rentalBookings
  }

  const saveReservationDecision = (input: ReservationDecisionInput) => {
    const result = applyReservationDecision(
      {
        rentalBookings: adminRentalBookings.value,
        reservations: adminReservations.value,
      },
      input,
    )

    adminReservations.value = result.reservations
    adminRentalBookings.value = result.rentalBookings
    workflowMessage.value = result.message

    return result
  }

  const clearWorkflowMessage = () => {
    workflowMessage.value = ''
  }

  return {
    adminRentalBookings,
    adminReservations,
    clearWorkflowMessage,
    getDefaultDecisionMode,
    replaceReservationWorkflowState,
    saveReservationDecision,
    workflowMessage,
  }
}
