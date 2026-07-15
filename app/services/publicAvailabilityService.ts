import type { LakeSlug, RentalBooking, Reservation } from '~/data/pond'

export interface PublicAvailabilityReservation {
  from: string
  id: string
  lake: LakeSlug
  pegId: string
  status: Reservation['status']
  to: string
}

export interface PublicRentalBooking {
  from: string
  id: string
  quantity: number
  rentalItemId: string
  status: RentalBooking['status']
  to: string
}

export interface PublicReservationStateResponse {
  ok: true
  rentalBookings: PublicRentalBooking[]
  reservations: PublicAvailabilityReservation[]
  updatedAt: string
}

interface ReservationStateSource {
  rentalBookings: readonly RentalBooking[]
  reservations: readonly Reservation[]
  updatedAt: string
}

/**
 * Public availability only needs dates, place IDs, statuses and rental stock.
 * Synthetic IDs prevent contact-derived reservation IDs from leaking publicly.
 */
export function createPublicReservationState(
  state: ReservationStateSource,
): PublicReservationStateResponse {
  return {
    ok: true,
    rentalBookings: state.rentalBookings.map((booking, index) => ({
      from: booking.from,
      id: `public-rental-${index + 1}`,
      quantity: booking.quantity,
      rentalItemId: booking.rentalItemId,
      status: booking.status,
      to: booking.to,
    })),
    reservations: state.reservations.map((reservation, index) => ({
      from: reservation.from,
      id: `public-reservation-${index + 1}`,
      lake: reservation.lake,
      pegId: reservation.pegId,
      status: reservation.status,
      to: reservation.to,
    })),
    updatedAt: state.updatedAt,
  }
}
