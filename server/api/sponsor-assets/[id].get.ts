import { createError, defineEventHandler, getRouterParam, setHeader } from 'h3'
import { readLocalSponsorLogoFile } from '../../utils/localSponsorAssetStore'
import { readLocalSponsorState } from '../../utils/localSponsorStore'

export default defineEventHandler(async (event) => {
  const assetId = getRouterParam(event, 'id') ?? ''
  const state = await readLocalSponsorState()
  const sponsor = state.sponsors.find((item) =>
    item.logoAssetId === assetId || item.logoVariants?.some((variant) => variant.variantId === assetId),
  )
  const variant = sponsor?.logoVariants?.find((item) => item.variantId === assetId)
  const logoStoragePath = variant?.storagePath ?? sponsor?.logoStoragePath
  const logoMimeType = variant?.mimeType ?? sponsor?.logoMimeType

  if (!logoMimeType || !logoStoragePath) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Sponsor asset not found',
    })
  }

  try {
    const buffer = await readLocalSponsorLogoFile({ logoStoragePath })
    setHeader(event, 'content-type', logoMimeType)
    setHeader(event, 'cache-control', 'public, max-age=300')

    return buffer
  }
  catch {
    throw createError({
      statusCode: 404,
      statusMessage: 'Sponsor asset file not found',
    })
  }
})
