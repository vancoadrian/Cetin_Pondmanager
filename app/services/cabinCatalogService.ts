import type { CabinProduct, Peg, Reservation } from '~/data/pond'
import {
  cabinCatalogSettingsInputSchema,
  getValidationMessages,
} from '~/schemas/pondSchemas'

export interface CabinCatalogValidationFailure {
  ok: false
  messages: string[]
  statusCode: 400 | 404 | 422
}

export interface CabinCatalogStateResponse {
  cabinProducts: CabinProduct[]
  ok: true
  updatedAt: string
}

export interface CabinCatalogMutationSuccess extends CabinCatalogStateResponse {
  message: string
  statusCode: 200
}

export interface CabinCatalogWorkflowState {
  cabinProducts: CabinProduct[]
  pegs: Peg[]
  reservations?: Reservation[]
}

export type CabinCatalogMutationResult = CabinCatalogValidationFailure | CabinCatalogMutationSuccess

function unique(values: string[]) {
  return [...new Set(values)]
}

function validationFailure(
  messages: string[],
  statusCode: CabinCatalogValidationFailure['statusCode'] = 422,
): CabinCatalogValidationFailure {
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

export function sortCabinProducts(items: CabinProduct[]) {
  return [...items].sort((first, second) => first.label.localeCompare(second.label, 'sk'))
}

export function updateCabinCatalogSettings(
  rawInput: unknown,
  state: CabinCatalogWorkflowState,
): CabinCatalogMutationResult {
  const payloadResult = cabinCatalogSettingsInputSchema.safeParse(rawInput)
  if (!payloadResult.success) {
    return validationFailure(getValidationMessages(payloadResult))
  }

  const payload = payloadResult.data
  const duplicateCabinIds = duplicateIds(payload.cabinProducts.map((cabin) => cabin.id))
  if (duplicateCabinIds.length > 0) {
    return validationFailure(duplicateCabinIds.map((id) => `Chata je v požiadavke duplicitne: ${id}.`))
  }

  const pegMap = new Map(state.pegs.map((peg) => [peg.id, peg]))
  const assignedPegIds = payload.cabinProducts.flatMap((cabin) => cabin.pegIds)
  const duplicateAssignedPegIds = duplicateIds(assignedPegIds)
  const missingPegIds = assignedPegIds.filter((pegId) => !pegMap.has(pegId))
  const nonCabinPegIds = assignedPegIds.filter((pegId) => pegMap.get(pegId)?.type !== 'cabin')
  if (duplicateAssignedPegIds.length > 0 || missingPegIds.length > 0 || nonCabinPegIds.length > 0) {
    return validationFailure([
      ...duplicateAssignedPegIds.map((pegId) => `Lovné miesto je priradené k viacerým chatám: ${pegId}.`),
      ...missingPegIds.map((pegId) => `Lovné miesto pre chatu neexistuje: ${pegId}.`),
      ...nonCabinPegIds.map((pegId) => `Lovné miesto nie je označené ako miesto s chatou: ${pegId}.`),
    ])
  }

  const cabinProductIds = new Set(payload.cabinProducts.map((cabin) => cabin.id))
  const missingReservationCabinIds = (state.reservations ?? [])
    .map((reservation) => reservation.cabinProductId)
    .filter((id): id is string => typeof id === 'string' && !cabinProductIds.has(id))
  if (missingReservationCabinIds.length > 0) {
    return validationFailure(
      unique(missingReservationCabinIds).map((id) => `Chatu nemožno odstrániť, je použitá v rezerváciách: ${id}.`),
    )
  }

  return {
    cabinProducts: sortCabinProducts(payload.cabinProducts.map((cabin) => ({
      capacity: cabin.capacity,
      equipment: [...cabin.equipment],
      extraPersonFeeEur: cabin.extraPersonFeeEur,
      id: cabin.id,
      label: cabin.label,
      minimumHours: cabin.minimumHours,
      pegIds: [...new Set(cabin.pegIds)],
      pricePer24hEur: cabin.pricePer24hEur,
      requiresPermitNote: cabin.requiresPermitNote,
    }))),
    message: 'Väzby chát na lovné miesta boli uložené.',
    ok: true,
    statusCode: 200,
    updatedAt: new Date().toISOString(),
  }
}
