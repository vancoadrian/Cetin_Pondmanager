import type {
  CabinProduct,
  LakeSlug,
  PaymentMethod,
  PermitProduct,
  RentalBooking,
  RentalItem,
  RequiredEquipmentItem,
  Reservation,
  ReservationExtra,
} from '../data/pond'
import { mapBy, rowId, snakeValue, type SeedRow } from './supabaseSeedShared.ts'

export interface SupabaseSeedCommerceSource {
  cabinProducts: CabinProduct[]
  paymentMethods: PaymentMethod[]
  permitProducts: PermitProduct[]
  rentalBookings: RentalBooking[]
  rentalItems: RentalItem[]
  requiredEquipment: RequiredEquipmentItem[]
  reservationExtras: ReservationExtra[]
  reservations: Reservation[]
}

export interface SupabaseSeedCommerceReferenceIds {
  cabinProductIds: Record<string, string>
  paymentMethodIds: Record<string, string>
  permitProductIds: Record<string, string>
  rentalItemIds: Record<string, string>
  reservationExtraIds: Record<string, string>
  reservationIds: Record<string, string>
}

export function buildCommerceReferenceIds(
  source: Pick<
    SupabaseSeedCommerceSource,
    'cabinProducts' | 'paymentMethods' | 'permitProducts' | 'rentalItems' | 'reservationExtras' | 'reservations'
  >,
): SupabaseSeedCommerceReferenceIds {
  const permitProductIds = mapBy(
    source.permitProducts,
    (permit) => permit.id,
    (permit) => rowId('permit_products', permit.id),
  )
  const cabinProductIds = mapBy(
    source.cabinProducts,
    (cabin) => cabin.id,
    (cabin) => rowId('cabin_products', cabin.id),
  )
  const rentalItemIds = mapBy(source.rentalItems, (item) => item.id, (item) => rowId('rental_items', item.id))
  const paymentMethodIds = mapBy(
    source.paymentMethods,
    (method) => method.id,
    (method) => rowId('payment_methods', method.id),
  )
  const reservationExtraIds = mapBy(
    source.reservationExtras,
    (extra) => extra.id,
    (extra) => rowId('reservation_extras', extra.id),
  )
  const reservationIds = mapBy(
    source.reservations,
    (reservation) => reservation.id,
    (reservation) => rowId('reservations', reservation.id),
  )

  return {
    cabinProductIds,
    paymentMethodIds,
    permitProductIds,
    rentalItemIds,
    reservationExtraIds,
    reservationIds,
  }
}

export interface SupabaseSeedCommerceTablesParams {
  cabinProductIds: Record<string, string>
  lakeIds: Record<LakeSlug, string>
  paymentMethodIds: Record<string, string>
  pegIds: Record<string, string>
  permitProductIds: Record<string, string>
  rentalItemIds: Record<string, string>
  reservationExtraIds: Record<string, string>
  reservationIds: Record<string, string>
  venueId: string
}

export function buildCommerceTables(
  source: SupabaseSeedCommerceSource,
  params: SupabaseSeedCommerceTablesParams,
): Record<string, SeedRow[]> {
  const {
    cabinProductIds,
    lakeIds,
    paymentMethodIds,
    pegIds,
    permitProductIds,
    rentalItemIds,
    reservationExtraIds,
    reservationIds,
    venueId,
  } = params

  return {
    cabin_product_pegs: source.cabinProducts.flatMap((cabin) =>
      cabin.pegIds.map((pegId) => ({
        cabin_product_id: cabinProductIds[cabin.id]!,
        peg_id: pegIds[pegId]!,
      })),
    ),
    cabin_products: source.cabinProducts.map((cabin) => ({
      active: true,
      capacity: cabin.capacity,
      code: cabin.id,
      equipment: cabin.equipment,
      extra_person_fee_eur: cabin.extraPersonFeeEur ?? null,
      id: cabinProductIds[cabin.id]!,
      label: cabin.label,
      minimum_hours: cabin.minimumHours,
      price_per_24h_eur: cabin.pricePer24hEur,
      requires_permit_note: cabin.requiresPermitNote,
      venue_id: venueId,
    })),
    payment_methods: source.paymentMethods.map((method) => ({
      code: method.id,
      enabled: method.enabled,
      id: paymentMethodIds[method.id]!,
      instructions: method.instructions,
      kind: method.kind === 'bank-transfer' ? 'bank_transfer' : method.kind === 'card-gateway' ? 'card_gateway' : 'cash',
      label: method.label,
      settlement: method.settlement === 'on-site' ? 'on_site' : method.settlement,
      sort_order: method.sortOrder,
      venue_id: venueId,
    })),
    permit_products: source.permitProducts.map((permit) => ({
      active: true,
      code: permit.id,
      duration_hours: permit.durationHours,
      id: permitProductIds[permit.id]!,
      label: permit.label,
      note: permit.note ?? null,
      price_eur: permit.priceEur,
      venue_id: venueId,
    })),
    rental_bookings: source.rentalBookings.map((booking) => ({
      ends_on: booking.to,
      id: rowId('rental_bookings', booking.id),
      lake_id: lakeIds[booking.lake]!,
      note: booking.note,
      quantity: booking.quantity,
      rental_item_id: rentalItemIds[booking.rentalItemId]!,
      reservation_id: reservationIds[booking.reservationId] ?? null,
      starts_on: booking.from,
      status: booking.status,
      venue_id: venueId,
    })),
    rental_items: source.rentalItems.map((item) => ({
      active: item.active,
      category: snakeValue(item.category),
      code: item.id,
      description: item.description,
      id: rentalItemIds[item.id]!,
      label: item.label,
      price_label: item.priceLabel,
      recommended: item.recommended,
      stock: item.stock,
      venue_id: venueId,
    })),
    required_equipment_items: source.requiredEquipment.map((item, index) => ({
      active: true,
      code: item.id,
      detail: item.detail,
      id: rowId('required_equipment_items', item.id),
      label: item.label,
      rentable: item.rentable,
      sort_order: index + 1,
      venue_id: venueId,
    })),
    reservation_extras: source.reservationExtras.map((extra) => ({
      active: extra.active,
      applies_to: extra.appliesTo,
      code: extra.id,
      description: extra.description,
      id: reservationExtraIds[extra.id]!,
      label: extra.label,
      lake_id: extra.lake ? lakeIds[extra.lake] : null,
      price_label: extra.priceLabel,
      source: extra.source,
      venue_id: venueId,
    })),
    reservation_items: source.reservations.flatMap((reservation) => {
      const rows: SeedRow[] = [
        {
          id: rowId('reservation_items', `${reservation.id}:permit:${reservation.permitId}`),
          item_id: permitProductIds[reservation.permitId]!,
          label: source.permitProducts.find((permit) => permit.id === reservation.permitId)?.label ?? reservation.permitId,
          quantity: 1,
          reservation_id: reservationIds[reservation.id]!,
          type: 'permit',
          unit_price_eur: source.permitProducts.find((permit) => permit.id === reservation.permitId)?.priceEur ?? null,
        },
      ]

      if (reservation.cabinProductId) {
        rows.push({
          id: rowId('reservation_items', `${reservation.id}:cabin:${reservation.cabinProductId}`),
          item_id: cabinProductIds[reservation.cabinProductId]!,
          label: source.cabinProducts.find((cabin) => cabin.id === reservation.cabinProductId)?.label ?? reservation.cabinProductId,
          quantity: 1,
          reservation_id: reservationIds[reservation.id]!,
          type: 'cabin',
          unit_price_eur: source.cabinProducts.find((cabin) => cabin.id === reservation.cabinProductId)?.pricePer24hEur ?? null,
        })
      }

      for (const rentalId of reservation.rentalIds) {
        rows.push({
          id: rowId('reservation_items', `${reservation.id}:rental:${rentalId}`),
          item_id: rentalItemIds[rentalId]!,
          label: source.rentalItems.find((item) => item.id === rentalId)?.label ?? rentalId,
          quantity: 1,
          reservation_id: reservationIds[reservation.id]!,
          type: 'rental',
          unit_price_eur: null,
        })
      }

      for (const extraId of reservation.extraIds) {
        rows.push({
          id: rowId('reservation_items', `${reservation.id}:extra:${extraId}`),
          item_id: reservationExtraIds[extraId]!,
          label: source.reservationExtras.find((extra) => extra.id === extraId)?.label ?? extraId,
          quantity: 1,
          reservation_id: reservationIds[reservation.id]!,
          type: 'extra',
          unit_price_eur: null,
        })
      }

      return rows
    }),
    reservations: source.reservations.map((reservation) => ({
      cabin_product_id: reservation.cabinProductId ? cabinProductIds[reservation.cabinProductId] ?? null : null,
      contact_email: reservation.contactEmail ?? null,
      contact_phone: reservation.contactPhone,
      ends_on: reservation.to,
      guest_name: reservation.guest,
      id: reservationIds[reservation.id]!,
      internal_note: reservation.internalNote,
      lake_id: lakeIds[reservation.lake]!,
      payment_method_id: reservation.paymentMethodId ? paymentMethodIds[reservation.paymentMethodId] ?? null : null,
      payment_status: reservation.paymentStatus ?? 'unpaid',
      peg_id: pegIds[reservation.pegId]!,
      permit_product_id: permitProductIds[reservation.permitId]!,
      source: reservation.source,
      starts_on: reservation.from,
      status: reservation.status,
      type: reservation.type,
      venue_id: venueId,
    })),
  }
}
