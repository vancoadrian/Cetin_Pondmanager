import type { RentalItem, ReservationExtra } from '~/data/pond'
import {
  getValidationMessages,
  rentalCatalogSettingsInputSchema,
} from '~/schemas/pondSchemas'

export interface RentalCatalogValidationFailure {
  ok: false
  messages: string[]
  statusCode: 400 | 404 | 422
}

export interface RentalCatalogStateResponse {
  ok: true
  rentalItems: RentalItem[]
  reservationExtras: ReservationExtra[]
  updatedAt: string
}

export interface RentalCatalogMutationSuccess {
  message: string
  ok: true
  rentalItems: RentalItem[]
  reservationExtras: ReservationExtra[]
  statusCode: 200
}

export interface RentalCatalogWorkflowState {
  rentalItems: RentalItem[]
  reservationExtras: ReservationExtra[]
}

export type RentalCatalogMutationResult = RentalCatalogValidationFailure | RentalCatalogMutationSuccess

function unique(values: string[]) {
  return [...new Set(values)]
}

function validationFailure(
  messages: string[],
  statusCode: RentalCatalogValidationFailure['statusCode'] = 422,
): RentalCatalogValidationFailure {
  return {
    ok: false,
    messages: unique(messages),
    statusCode,
  }
}

function duplicateIds(ids: string[]) {
  const seenIds = new Set<string>()

  return ids.filter((id) => {
    if (seenIds.has(id)) return true
    seenIds.add(id)

    return false
  })
}

export function sortRentalItems(items: RentalItem[]) {
  const categoryOrder: Record<RentalItem['category'], number> = {
    'fish-care': 1,
    cabin: 2,
    comfort: 3,
  }

  return [...items].sort((first, second) => {
    const categoryDiff = categoryOrder[first.category] - categoryOrder[second.category]
    if (categoryDiff !== 0) return categoryDiff

    return first.label.localeCompare(second.label, 'sk')
  })
}

export function sortReservationExtras(extras: ReservationExtra[]) {
  return [...extras].sort((first, second) => {
    const scopeDiff = first.appliesTo.localeCompare(second.appliesTo, 'sk')
    if (scopeDiff !== 0) return scopeDiff

    return first.label.localeCompare(second.label, 'sk')
  })
}

export function updateRentalCatalogSettings(
  rawInput: unknown,
  state: RentalCatalogWorkflowState,
): RentalCatalogMutationResult {
  const payloadResult = rentalCatalogSettingsInputSchema.safeParse(rawInput)
  if (!payloadResult.success) {
    return validationFailure(getValidationMessages(payloadResult))
  }

  const payload = payloadResult.data
  const duplicateRentalIds = duplicateIds(payload.rentalItems.map((item) => item.id))
  const duplicateExtraIds = duplicateIds(payload.reservationExtras.map((extra) => extra.id))
  if (duplicateRentalIds.length > 0 || duplicateExtraIds.length > 0) {
    return validationFailure([
      ...duplicateRentalIds.map((id) => `Výbava je v požiadavke duplicitne: ${id}.`),
      ...duplicateExtraIds.map((id) => `Doplnok je v požiadavke duplicitne: ${id}.`),
    ])
  }

  const rentalItemMap = new Map(state.rentalItems.map((item) => [item.id, item]))
  const reservationExtraMap = new Map(state.reservationExtras.map((extra) => [extra.id, extra]))
  const missingRentalIds = payload.rentalItems.filter((item) => !rentalItemMap.has(item.id)).map((item) => item.id)
  const missingExtraIds = payload.reservationExtras
    .filter((extra) => !reservationExtraMap.has(extra.id))
    .map((extra) => extra.id)
  if (missingRentalIds.length > 0 || missingExtraIds.length > 0) {
    return validationFailure([
      ...missingRentalIds.map((id) => `Výbava v katalógu neexistuje: ${id}.`),
      ...missingExtraIds.map((id) => `Doplnok v katalógu neexistuje: ${id}.`),
    ], 404)
  }

  const rentalUpdates = new Map(payload.rentalItems.map((item) => [item.id, item]))
  const extraUpdates = new Map(payload.reservationExtras.map((extra) => [extra.id, extra]))
  const rentalItems = sortRentalItems(
    state.rentalItems.map((item) => {
      const update = rentalUpdates.get(item.id)
      if (!update) return item

      return {
        ...item,
        active: update.active,
        priceLabel: update.priceLabel,
        recommended: update.recommended,
        stock: update.stock,
      }
    }),
  )
  const reservationExtras = sortReservationExtras(
    state.reservationExtras.map((extra) => {
      const update = extraUpdates.get(extra.id)
      if (!update) return extra

      return {
        ...extra,
        active: update.active,
        priceLabel: update.priceLabel,
        source: update.source,
      }
    }),
  )

  if (!rentalItems.some((item) => item.active) && !reservationExtras.some((extra) => extra.active)) {
    return validationFailure(['Zapnite aspoň jednu položku požičovne alebo doplnok k rezervácii.'])
  }

  return {
    message: 'Požičovňa a doplnky boli uložené do lokálneho stavu.',
    ok: true,
    rentalItems,
    reservationExtras,
    statusCode: 200,
  }
}
