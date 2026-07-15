import type { RentalBooking, RentalItem } from '~/data/pond'
import { rangesOverlap } from '~/utils/availability'

export type RentalAvailabilityStatus = 'available' | 'limited' | 'unavailable'

export interface RentalAvailabilityBooking {
  from: string
  id: string
  quantity: number
  rentalItemId: string
  status: RentalBooking['status']
  to: string
}

export interface RentalAvailabilityResult<
  TBooking extends RentalAvailabilityBooking = RentalBooking,
> {
  status: RentalAvailabilityStatus
  label: string
  description: string
  classes: string
  reservable: boolean
  stock: number
  reservedQuantity: number
  requestedQuantity: number
  availableQuantity: number
  reasons: string[]
  sourceIds: string[]
  bookings: TBooking[]
}

interface RentalAvailabilityInput<TBooking extends RentalAvailabilityBooking> {
  bookings: readonly TBooking[]
  dateFrom: string
  dateTo: string
}

const statusMeta: Record<
  RentalAvailabilityStatus,
  Pick<RentalAvailabilityResult, 'classes' | 'description' | 'label' | 'reservable'>
> = {
  available: {
    label: 'voľné',
    description: 'Výbava je v zvolenom termíne dostupná.',
    classes: 'bg-success-500/10 text-success-700 border-success-500/25',
    reservable: true,
  },
  limited: {
    label: 'posledné kusy',
    description: 'Výbava je dostupná, ale v termíne už má rezervácie alebo čakajúce žiadosti.',
    classes: 'bg-warning-500/10 text-warning-700 border-warning-500/25',
    reservable: true,
  },
  unavailable: {
    label: 'nedostupné',
    description: 'Výbava je v zvolenom termíne vyčerpaná.',
    classes: 'bg-error-500/10 text-error-700 border-error-500/25',
    reservable: false,
  },
}

export function getRentalAvailability<TBooking extends RentalAvailabilityBooking = RentalBooking>(
  item: RentalItem,
  input: RentalAvailabilityInput<TBooking>,
): RentalAvailabilityResult<TBooking> {
  const bookings = input.bookings.filter((booking) => {
    if (booking.rentalItemId !== item.id) return false
    if (['returned', 'unavailable', 'cancelled'].includes(booking.status)) return false

    return rangesOverlap(input.dateFrom, input.dateTo, booking.from, booking.to)
  })

  const reservedQuantity = bookings
    .filter((booking) => booking.status === 'reserved')
    .reduce((sum, booking) => sum + booking.quantity, 0)
  const requestedQuantity = bookings
    .filter((booking) => booking.status === 'requested')
    .reduce((sum, booking) => sum + booking.quantity, 0)
  if (!item.active) {
    return {
      status: 'unavailable',
      stock: item.stock,
      reservedQuantity,
      requestedQuantity,
      availableQuantity: 0,
      reasons: ['Položka je v katalógu požičovne vypnutá.'],
      sourceIds: bookings.map((booking) => booking.id),
      bookings,
      ...statusMeta.unavailable,
    }
  }

  const availableQuantity = Math.max(item.stock - reservedQuantity - requestedQuantity, 0)
  const status: RentalAvailabilityStatus =
    availableQuantity <= 0 ? 'unavailable' : availableQuantity <= 2 || bookings.length > 0 ? 'limited' : 'available'

  const reasons =
    bookings.length > 0
      ? [
          `${reservedQuantity} ks potvrdené, ${requestedQuantity} ks čaká, ${availableQuantity} ks voľné.`,
        ]
      : [`Sklad ${item.stock} ks bez rezervácie v termíne.`]

  return {
    status,
    stock: item.stock,
    reservedQuantity,
    requestedQuantity,
    availableQuantity,
    reasons,
    sourceIds: bookings.map((booking) => booking.id),
    bookings,
    ...statusMeta[status],
  }
}
