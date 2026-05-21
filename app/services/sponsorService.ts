import type { Sponsor, SponsorLogoVariant } from '~/data/pond'
import {
  getValidationMessages,
  sponsorSettingsInputSchema,
} from '~/schemas/pondSchemas'

export interface SponsorLogoUpload {
  dataUrl: string
  fileName: string
  height: number
  mimeType: NonNullable<Sponsor['logoMimeType']>
  sizeBytes: number
  width: number
}

export interface SponsorLogoWrite {
  placementType?: SponsorLogoVariant['placementType']
  sponsorId: string
  storagePath: string
  upload: SponsorLogoUpload
}

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
  logoUploads?: SponsorLogoWrite[]
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

function extensionForMimeType(mimeType: SponsorLogoUpload['mimeType']) {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'

  return 'jpg'
}

function safeAssetPart(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'sponsor'
}

function compactTimestamp(value: string) {
  const parsed = Date.parse(value)
  const date = Number.isFinite(parsed) ? new Date(parsed) : new Date()

  return date.toISOString().replace(/\D/g, '').slice(0, 14)
}

function createLogoAssetId(sponsorId: string, now: string) {
  return `logo-${safeAssetPart(sponsorId)}-${compactTimestamp(now)}`
}

function createLogoVariantAssetId(sponsorId: string, placementType: SponsorLogoVariant['placementType'], now: string) {
  return `logo-${safeAssetPart(sponsorId)}-${safeAssetPart(placementType)}-${compactTimestamp(now)}`
}

function copyLogoFields(target: Sponsor, source?: Sponsor) {
  if (!source?.logoUrl) return

  target.logoAssetId = source.logoAssetId
  target.logoFileName = source.logoFileName
  target.logoHeight = source.logoHeight
  target.logoMimeType = source.logoMimeType
  target.logoSizeBytes = source.logoSizeBytes
  target.logoStoragePath = source.logoStoragePath
  target.logoUpdatedAt = source.logoUpdatedAt
  target.logoUrl = source.logoUrl
  target.logoWidth = source.logoWidth
}

function copyLogoVariants(source?: Sponsor) {
  return source?.logoVariants?.map((variant) => ({ ...variant })) ?? []
}

function createLogoVariant(
  sponsorId: string,
  placementType: SponsorLogoVariant['placementType'],
  upload: SponsorLogoUpload,
  now: string,
) {
  const variantId = createLogoVariantAssetId(sponsorId, placementType, now)
  const storagePath = `sponsor-assets/${variantId}.${extensionForMimeType(upload.mimeType)}`
  const variant: SponsorLogoVariant = {
    fileName: upload.fileName,
    height: upload.height,
    mimeType: upload.mimeType,
    placementType,
    sizeBytes: upload.sizeBytes,
    storagePath,
    updatedAt: now,
    url: `/api/sponsor-assets/${variantId}`,
    variantId,
    width: upload.width,
  }

  return {
    storagePath,
    variant,
  }
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
  now = new Date().toISOString(),
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
  const existingSponsorsById = new Map(state.sponsors.map((sponsor) => [sponsor.id, sponsor]))
  const logoUploads: SponsorLogoWrite[] = []
  const sponsors = sortSponsors(payload.sponsors.map((sponsor) => {
    const existingSponsor = existingSponsorsById.get(sponsor.id)
    const nextSponsor: Sponsor = {
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
    }

    if (sponsor.logoUpload) {
      const upload = sponsor.logoUpload as SponsorLogoUpload
      const logoAssetId = createLogoAssetId(sponsor.id, now)
      const storagePath = `sponsor-assets/${logoAssetId}.${extensionForMimeType(upload.mimeType)}`

      nextSponsor.logoAssetId = logoAssetId
      nextSponsor.logoFileName = upload.fileName
      nextSponsor.logoHeight = upload.height
      nextSponsor.logoMimeType = upload.mimeType
      nextSponsor.logoSizeBytes = upload.sizeBytes
      nextSponsor.logoStoragePath = storagePath
      nextSponsor.logoUpdatedAt = now
      nextSponsor.logoUrl = `/api/sponsor-assets/${logoAssetId}`
      nextSponsor.logoWidth = upload.width
      logoUploads.push({
        sponsorId: sponsor.id,
        storagePath,
        upload,
      })
    }
    else if (!sponsor.removeLogo) {
      copyLogoFields(nextSponsor, existingSponsor)
    }

    const variantMap = new Map(
      copyLogoVariants(existingSponsor).map((variant) => [variant.placementType, variant]),
    )

    for (const variantInput of sponsor.logoVariants) {
      if (variantInput.removeLogo) {
        variantMap.delete(variantInput.placementType)
        continue
      }
      if (!variantInput.logoUpload) continue

      const upload = variantInput.logoUpload as SponsorLogoUpload
      const nextVariant = createLogoVariant(sponsor.id, variantInput.placementType, upload, now)
      variantMap.set(variantInput.placementType, nextVariant.variant)
      logoUploads.push({
        placementType: variantInput.placementType,
        sponsorId: sponsor.id,
        storagePath: nextVariant.storagePath,
        upload,
      })
    }

    const logoVariants = [...variantMap.values()].sort((first, second) =>
      first.placementType.localeCompare(second.placementType),
    )
    if (logoVariants.length > 0) nextSponsor.logoVariants = logoVariants

    return nextSponsor
  }))

  return {
    createdSponsorIds,
    logoUploads,
    message: createdSponsorIds.length > 0
      ? `Sponzori boli uložení, pribudlo ${createdSponsorIds.length} partnerov.`
      : 'Sponzori a ich umiestnenia boli uložené do lokálneho stavu.',
    ok: true,
    sponsors,
    statusCode: 200,
  }
}
