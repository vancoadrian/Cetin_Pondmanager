import type { RentalBooking, RentalItem, Reservation, ReservationExtra } from '~/data/pond'
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
  removedRentalItemIds: string[]
  removedReservationExtraIds: string[]
  rentalItems: RentalItem[]
  reservationExtras: ReservationExtra[]
  statusCode: 200
}

export interface RentalCatalogWorkflowState {
  rentalBookings?: RentalBooking[]
  rentalItems: RentalItem[]
  reservations?: Reservation[]
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

function usageLabel(label: string, ids: string[]) {
  return ids.length > 0 ? `${label} (${ids.join(', ')})` : label
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
  const duplicateRemovedRentalIds = duplicateIds(payload.removeRentalItemIds)
  const duplicateRemovedExtraIds = duplicateIds(payload.removeReservationExtraIds)
  if (
    duplicateRentalIds.length > 0 ||
    duplicateExtraIds.length > 0 ||
    duplicateRemovedRentalIds.length > 0 ||
    duplicateRemovedExtraIds.length > 0
  ) {
    return validationFailure([
      ...duplicateRentalIds.map((id) => `Výbava je v požiadavke duplicitne: ${id}.`),
      ...duplicateExtraIds.map((id) => `Doplnok je v požiadavke duplicitne: ${id}.`),
      ...duplicateRemovedRentalIds.map((id) => `Výbava je duplicitne označená na odstránenie: ${id}.`),
      ...duplicateRemovedExtraIds.map((id) => `Doplnok je duplicitne označený na odstránenie: ${id}.`),
    ])
  }

  const rentalUpdates = new Map(payload.rentalItems.map((item) => [item.id, item]))
  const extraUpdates = new Map(payload.reservationExtras.map((extra) => [extra.id, extra]))
  const existingRentalIds = new Set(state.rentalItems.map((item) => item.id))
  const existingExtraIds = new Set(state.reservationExtras.map((extra) => extra.id))
  const removedRentalItemIds = unique(payload.removeRentalItemIds)
  const removedReservationExtraIds = unique(payload.removeReservationExtraIds)
  const removedRentalItemIdSet = new Set(removedRentalItemIds)
  const removedReservationExtraIdSet = new Set(removedReservationExtraIds)
  const updateRemoveRentalConflicts = payload.rentalItems
    .filter((item) => removedRentalItemIdSet.has(item.id))
    .map((item) => item.id)
  const updateRemoveExtraConflicts = payload.reservationExtras
    .filter((extra) => removedReservationExtraIdSet.has(extra.id))
    .map((extra) => extra.id)
  if (updateRemoveRentalConflicts.length > 0 || updateRemoveExtraConflicts.length > 0) {
    return validationFailure([
      ...updateRemoveRentalConflicts.map((id) => `Výbavu nemožno naraz upraviť aj odstrániť: ${id}.`),
      ...updateRemoveExtraConflicts.map((id) => `Doplnok nemožno naraz upraviť aj odstrániť: ${id}.`),
    ])
  }

  const missingRemovedRentalIds = removedRentalItemIds.filter((id) => !existingRentalIds.has(id))
  const missingRemovedExtraIds = removedReservationExtraIds.filter((id) => !existingExtraIds.has(id))
  if (missingRemovedRentalIds.length > 0 || missingRemovedExtraIds.length > 0) {
    return validationFailure([
      ...missingRemovedRentalIds.map((id) => `Výbava určená na odstránenie neexistuje: ${id}.`),
      ...missingRemovedExtraIds.map((id) => `Doplnok určený na odstránenie neexistuje: ${id}.`),
    ], 404)
  }

  const usedRentalIds = new Set([
    ...(state.reservations ?? []).flatMap((reservation) => reservation.rentalIds),
    ...(state.rentalBookings ?? []).map((booking) => booking.rentalItemId),
  ])
  const usedExtraIds = new Set((state.reservations ?? []).flatMap((reservation) => reservation.extraIds))
  const blockedRemovedRentalItems = state.rentalItems.filter((item) =>
    removedRentalItemIdSet.has(item.id) && usedRentalIds.has(item.id),
  )
  const blockedRemovedExtras = state.reservationExtras.filter((extra) =>
    removedReservationExtraIdSet.has(extra.id) && usedExtraIds.has(extra.id),
  )
  if (blockedRemovedRentalItems.length > 0 || blockedRemovedExtras.length > 0) {
    return validationFailure([
      ...blockedRemovedRentalItems.map((item) =>
        `Výbavu nemožno odstrániť, je použitá v rezerváciách alebo výpožičkách: ${usageLabel(item.label, [item.id])}. Položku radšej vypnite.`,
      ),
      ...blockedRemovedExtras.map((extra) =>
        `Doplnok nemožno odstrániť, je použitý v rezerváciách: ${usageLabel(extra.label, [extra.id])}. Doplnok radšej vypnite.`,
      ),
    ])
  }

  const rentalItems = sortRentalItems(
    [
      ...state.rentalItems
        .filter((item) => !removedRentalItemIdSet.has(item.id))
        .map((item) => {
          const update = rentalUpdates.get(item.id)
          if (!update) return item

          return {
            ...item,
            active: update.active,
            category: update.category,
            description: update.description,
            label: update.label,
            priceLabel: update.priceLabel,
            recommended: update.recommended,
            stock: update.stock,
          }
        }),
      ...payload.rentalItems
        .filter((item) => !existingRentalIds.has(item.id))
        .map((item) => ({
          active: item.active,
          category: item.category,
          description: item.description,
          id: item.id,
          label: item.label,
          priceLabel: item.priceLabel,
          recommended: item.recommended,
          stock: item.stock,
        })),
    ],
  )
  const reservationExtras = sortReservationExtras(
    [
      ...state.reservationExtras
        .filter((extra) => !removedReservationExtraIdSet.has(extra.id))
        .map((extra) => {
          const update = extraUpdates.get(extra.id)
          if (!update) return extra

          return {
            ...extra,
            active: update.active,
            appliesTo: update.appliesTo,
            description: update.description,
            label: update.label,
            lake: update.lake,
            priceLabel: update.priceLabel,
            source: update.source,
          }
        }),
      ...payload.reservationExtras
        .filter((extra) => !existingExtraIds.has(extra.id))
        .map((extra) => ({
          active: extra.active,
          appliesTo: extra.appliesTo,
          description: extra.description,
          id: extra.id,
          label: extra.label,
          lake: extra.lake,
          priceLabel: extra.priceLabel,
          source: extra.source,
        })),
    ],
  )

  if (!rentalItems.some((item) => item.active) && !reservationExtras.some((extra) => extra.active)) {
    return validationFailure(['Zapnite aspoň jednu položku požičovne alebo doplnok k rezervácii.'])
  }

  const createdRentalCount = payload.rentalItems.filter((item) => !existingRentalIds.has(item.id)).length
  const createdExtraCount = payload.reservationExtras.filter((extra) => !existingExtraIds.has(extra.id)).length

  return {
    message: createdRentalCount > 0 || createdExtraCount > 0
      ? `Požičovňa bola uložená, pribudlo ${createdRentalCount} položiek výbavy a ${createdExtraCount} doplnkov.`
      : removedRentalItemIds.length > 0 || removedReservationExtraIds.length > 0
        ? `Požičovňa bola uložená, odstránené položky: ${removedRentalItemIds.length} výbava, ${removedReservationExtraIds.length} doplnky.`
        : 'Požičovňa a doplnky boli uložené.',
    ok: true,
    removedRentalItemIds,
    removedReservationExtraIds,
    rentalItems,
    reservationExtras,
    statusCode: 200,
  }
}
