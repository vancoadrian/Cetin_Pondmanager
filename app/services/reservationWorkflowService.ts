import type { RentalBooking, Reservation } from '~/data/pond'

export type ReservationDecisionMode = 'approve' | 'call' | 'reject'

export interface ReservationWorkflowState {
  rentalBookings: RentalBooking[]
  reservations: Reservation[]
}

export interface ReservationDecisionInput {
  decisionMode: ReservationDecisionMode
  note: string
  reservationId: string
}

export interface ReservationDecisionResult extends ReservationWorkflowState {
  message: string
  rentalStatus: RentalBooking['status']
  reservationStatus: Reservation['status']
}

export function cloneReservationWorkflowState(
  reservations: Reservation[],
  rentalBookings: RentalBooking[],
): ReservationWorkflowState {
  return {
    reservations: reservations.map((reservation) => ({
      ...reservation,
      extraIds: [...reservation.extraIds],
      rentalIds: [...reservation.rentalIds],
    })),
    rentalBookings: rentalBookings.map((booking) => ({ ...booking })),
  }
}

export function getDefaultDecisionMode(reservation?: Reservation): ReservationDecisionMode {
  return reservation?.status === 'pending' ? 'approve' : 'call'
}

function resolveDecisionStatuses(decisionMode: ReservationDecisionMode) {
  if (decisionMode === 'approve') {
    return {
      rentalStatus: 'reserved' as const,
      reservationStatus: 'confirmed' as const,
    }
  }

  if (decisionMode === 'reject') {
    return {
      rentalStatus: 'cancelled' as const,
      reservationStatus: 'blocked' as const,
    }
  }

  return {
    rentalStatus: 'requested' as const,
    reservationStatus: 'pending' as const,
  }
}

function buildDecisionMessage(decisionMode: ReservationDecisionMode) {
  if (decisionMode === 'approve') {
    return 'Rezervácia je lokálne označená ako potvrdená a výbava je blokovaná.'
  }

  if (decisionMode === 'reject') {
    return 'Rezervácia je lokálne blokovaná a výbava sa uvoľnila späť do skladu.'
  }

  return 'Rezervácia zostáva čakajúca na telefonát alebo úpravu.'
}

export function applyReservationDecision(
  state: ReservationWorkflowState,
  input: ReservationDecisionInput,
): ReservationDecisionResult {
  const reservation = state.reservations.find((item) => item.id === input.reservationId)
  const { rentalStatus, reservationStatus } = resolveDecisionStatuses(input.decisionMode)

  if (!reservation) {
    return {
      ...state,
      message: 'Rezervácia sa nenašla v lokálnom mock stave.',
      rentalStatus,
      reservationStatus,
    }
  }

  const note = input.note.trim() || reservation.internalNote

  return {
    reservations: state.reservations.map((item) =>
      item.id === input.reservationId
        ? {
            ...item,
            internalNote: note,
            status: reservationStatus,
          }
        : item,
    ),
    rentalBookings: state.rentalBookings.map((booking) =>
      booking.reservationId === input.reservationId
        ? {
            ...booking,
            note,
            status: rentalStatus,
          }
        : booking,
    ),
    message: buildDecisionMessage(input.decisionMode),
    rentalStatus,
    reservationStatus,
  }
}

