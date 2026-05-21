import type { Sponsor } from '~/data/pond'
import {
  getValidationMessages,
  sponsorSettingsInputSchema,
} from '~/schemas/pondSchemas'

export interface SponsorValidationFailure {
  ok: false
  messages: string[]
  statusCode: 400 | 404 | 422
}

export interface SponsorStateResponse {
  ok: true
  sponsors: Sponsor[]
  updatedAt: string
}

export interface SponsorMutationSuccess {
  createdSponsorIds: string[]
  message: string
  ok: true
  sponsors: Sponsor[]
  statusCode: 200
}

export interface SponsorWorkflowState {
  sponsors: Sponsor[]
}

export type SponsorMutationResult = SponsorValidationFailure | SponsorMutationSuccess

function unique(values: string[]) {
  return [...new Set(values)]
}

function validationFailure(
  messages: string[],
  statusCode: SponsorValidationFailure['statusCode'] = 422,
): SponsorValidationFailure {
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

export function sortSponsors(sponsors: Sponsor[]) {
  const tierOrder: Record<Sponsor['tier'], number> = {
    main: 1,
    tournament: 2,
    partner: 3,
    sector: 4,
  }

  return [...sponsors].sort((first, second) => {
    if (first.active !== second.active) return first.active ? -1 : 1

    const orderDiff = (first.sortOrder ?? 999) - (second.sortOrder ?? 999)
    if (orderDiff !== 0) return orderDiff

    const tierDiff = tierOrder[first.tier] - tierOrder[second.tier]
    if (tierDiff !== 0) return tierDiff

    return first.name.localeCompare(second.name, 'sk')
  })
}

export function updateSponsorSettings(
  rawInput: unknown,
  state: SponsorWorkflowState,
): SponsorMutationResult {
  const payloadResult = sponsorSettingsInputSchema.safeParse(rawInput)
  if (!payloadResult.success) {
    return validationFailure(getValidationMessages(payloadResult))
  }

  const payload = payloadResult.data
  const duplicateSponsorIds = duplicateIds(payload.sponsors.map((sponsor) => sponsor.id))
  if (duplicateSponsorIds.length > 0) {
    return validationFailure(
      duplicateSponsorIds.map((id) => `Sponzor je v požiadavke duplicitne: ${id}.`),
    )
  }

  const existingSponsorIds = new Set(state.sponsors.map((sponsor) => sponsor.id))
  const createdSponsorIds = payload.sponsors
    .filter((sponsor) => !existingSponsorIds.has(sponsor.id))
    .map((sponsor) => sponsor.id)
  const sponsors = sortSponsors(payload.sponsors.map((sponsor) => ({
    active: sponsor.active,
    description: sponsor.description,
    id: sponsor.id,
    logoText: sponsor.logoText,
    name: sponsor.name,
    placement: sponsor.placement,
    placementType: sponsor.placementType,
    sectorId: sponsor.sectorId?.trim() || undefined,
    sortOrder: sponsor.sortOrder,
    tier: sponsor.tier,
    tournamentId: sponsor.tournamentId?.trim() || undefined,
    validFrom: sponsor.validFrom || undefined,
    validTo: sponsor.validTo || undefined,
    website: sponsor.website?.trim() || undefined,
  })))

  return {
    createdSponsorIds,
    message: createdSponsorIds.length > 0
      ? `Sponzori boli uložení, pribudlo ${createdSponsorIds.length} partnerov.`
      : 'Sponzori a ich umiestnenia boli uložené do lokálneho stavu.',
    ok: true,
    sponsors,
    statusCode: 200,
  }
}
