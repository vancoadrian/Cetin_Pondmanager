import type { RentalBooking, Reservation } from '~/data/pond'
import {
  getValidationMessages,
  reservationDecisionInputSchema,
  reservationRequestPayloadSchema,
  reservationRequestSchema,
} from '~/schemas/pondSchemas'
import { createPondService, pondService, type PondService } from '~/services/pondService'
import {
  applyReservationDecision,
  cloneReservationWorkflowState,
  type ReservationDecisionResult,
  type ReservationWorkflowState,
} from '~/services/reservationWorkflowService'
import { getPegAvailability } from '~/utils/availability'
import { getRentalAvailability } from '~/utils/rentals'

export interface ApiValidationFailure {
  ok: false
  messages: string[]
  statusCode: 400 | 404 | 422
}

export interface ReservationSubmissionSuccess {
  ok: true
  message: string
  rentalBookings: RentalBooking[]
  reservation: Reservation
  statusCode: 201
}

export interface ReservationDecisionSuccess extends ReservationDecisionResult {
  ok: true
  reservation: Reservation
  statusCode: 200
}

export interface ReservationStateResponse {
  ok: true
  rentalBookings: RentalBooking[]
  reservations: Reservation[]
  updatedAt: string
}

export type ReservationSubmissionResult = ApiValidationFailure | ReservationSubmissionSuccess
export type ReservationDecisionApiResult = ApiValidationFailure | ReservationDecisionSuccess

const dayMs = 24 * 60 * 60 * 1000

function resolveReservationType(dateFrom: string, dateTo: string): Reservation['type'] {
  const fromTime = Date.parse(`${dateFrom}T00:00:00Z`)
  const toTime = Date.parse(`${dateTo}T00:00:00Z`)
  const days = Number.isFinite(fromTime) && Number.isFinite(toTime)
    ? Math.max(Math.round((toTime - fromTime) / dayMs) + 1, 1)
    : 1

  if (days >= 7) return 'week'
  if (days >= 2) return 'weekend'

  return 'day'
}

function buildReservationId(dateFrom: string, pegId: string, contactPhone: string, existingIds: Set<string>) {
  const phoneSuffix = contactPhone.replace(/\D/g, '').slice(-4) || '0000'
  const baseId = `req-${dateFrom.replaceAll('-', '')}-${pegId}-${phoneSuffix}`
  if (!existingIds.has(baseId)) return baseId

  let index = 2
  while (existingIds.has(`${baseId}-${index}`)) {
    index += 1
  }

  return `${baseId}-${index}`
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function validationFailure(messages: string[], statusCode: ApiValidationFailure['statusCode'] = 422): ApiValidationFailure {
  return {
    ok: false,
    messages: unique(messages),
    statusCode,
  }
}

export function submitReservationRequest(
  rawInput: unknown,
  service: PondService = pondService,
): ReservationSubmissionResult {
  const payloadResult = reservationRequestPayloadSchema.safeParse(rawInput)
  if (!payloadResult.success) {
    return validationFailure(getValidationMessages(payloadResult))
  }

  const payload = payloadResult.data
  const peg = service.pegs.find((item) => item.id === payload.pegId && item.lake === payload.lake)
  const permit = service.permitProducts.find((item) => item.id === payload.permitId)
  const cabin = service.cabinProducts.find((item) => item.pegIds.includes(payload.pegId))
  const rentalItems = payload.rentalIds.map((id) => service.rentalItems.find((item) => item.id === id))
  const selectedRentalLabels = rentalItems
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) =>
      !getRentalAvailability(item, {
        bookings: service.rentalBookings,
        dateFrom: payload.dateFrom,
        dateTo: payload.dateTo,
      }).reservable,
    )
    .map((item) => item.label)
  const availableExtraIds = new Set(
    service.reservationExtras
      .filter((extra) => {
        const lakeMatches = !extra.lake || extra.lake === payload.lake
        const surfaceMatches = extra.appliesTo === 'all' || Boolean(cabin)

        return lakeMatches && surfaceMatches
      })
      .map((extra) => extra.id),
  )

  const referenceMessages = [
    ...(!peg ? ['Vybrané lovné miesto neexistuje pre zvolené jazero.'] : []),
    ...(!permit ? ['Vybraná povolenka neexistuje v cenníku.'] : []),
    ...payload.rentalIds
      .filter((id, index) => !rentalItems[index])
      .map((id) => `Vybraná výbava neexistuje v požičovni: ${id}.`),
    ...payload.extraIds
      .filter((id) => !availableExtraIds.has(id))
      .map((id) => `Vybraný doplnok nie je dostupný pre túto rezerváciu: ${id}.`),
  ]

  const availability = peg
    ? getPegAvailability(peg, {
      closures: service.lakeClosures,
      dateFrom: payload.dateFrom,
      dateTo: payload.dateTo,
      reservations: service.reservations,
    })
    : undefined

  const serverDraft = {
    ...payload,
    cabinProductId: cabin?.id,
    requiresCabinReservation: Boolean(peg?.requiresCabinReservation),
    reservable: Boolean(availability?.reservable),
    unavailableRentalLabels: selectedRentalLabels,
  }
  const requestResult = reservationRequestSchema.safeParse(serverDraft)
  if (!requestResult.success || referenceMessages.length > 0) {
    return validationFailure([...referenceMessages, ...getValidationMessages(requestResult)])
  }

  const reservationId = buildReservationId(
    requestResult.data.dateFrom,
    requestResult.data.pegId,
    requestResult.data.contactPhone,
    new Set(service.reservations.map((reservation) => reservation.id)),
  )
  const reservation: Reservation = {
    id: reservationId,
    lake: requestResult.data.lake,
    pegId: requestResult.data.pegId,
    guest: requestResult.data.contactName,
    contactPhone: requestResult.data.contactPhone,
    from: requestResult.data.dateFrom,
    to: requestResult.data.dateTo,
    type: resolveReservationType(requestResult.data.dateFrom, requestResult.data.dateTo),
    status: 'pending',
    permitId: requestResult.data.permitId,
    cabinProductId: requestResult.data.cabinProductId,
    rentalIds: requestResult.data.rentalIds,
    extraIds: requestResult.data.extraIds,
    internalNote: 'Webová žiadosť prijatá cez lokálne API. Správca ju má potvrdiť telefonicky.',
    source: 'web',
  }
  const rentalBookings: RentalBooking[] = requestResult.data.rentalIds.map((rentalItemId, index) => ({
    id: `${reservationId}-rental-${index + 1}`,
    reservationId,
    rentalItemId,
    lake: requestResult.data.lake,
    from: requestResult.data.dateFrom,
    to: requestResult.data.dateTo,
    quantity: 1,
    status: 'requested',
    note: 'Žiadosť z verejného formulára čaká na potvrdenie správcom.',
  }))

  return {
    ok: true,
    message: 'Žiadosť je uložená lokálne a čaká na telefonické potvrdenie správcom.',
    rentalBookings,
    reservation,
    statusCode: 201,
  }
}

export function submitReservationDecision(
  rawInput: unknown,
  state: ReservationWorkflowState = cloneReservationWorkflowState(pondService.reservations, pondService.rentalBookings),
): ReservationDecisionApiResult {
  const payloadResult = reservationDecisionInputSchema.safeParse(rawInput)
  if (!payloadResult.success) {
    return validationFailure(getValidationMessages(payloadResult))
  }

  const reservationExists = state.reservations.some((reservation) => reservation.id === payloadResult.data.reservationId)
  if (!reservationExists) {
    return validationFailure(['Rezervácia sa nenašla v lokálnom mock stave.'], 404)
  }

  const result = applyReservationDecision(state, payloadResult.data)
  const reservation = result.reservations.find((item) => item.id === payloadResult.data.reservationId)
  if (!reservation) {
    return validationFailure(['Rezervácia sa nenašla po uložení rozhodnutia.'], 404)
  }

  return {
    ...result,
    ok: true,
    reservation,
    statusCode: 200,
  }
}

export function createReservationApiService(repositoryService: PondService = createPondService()) {
  return {
    submitReservationDecision,
    submitReservationRequest: (input: unknown) => submitReservationRequest(input, repositoryService),
  }
}
