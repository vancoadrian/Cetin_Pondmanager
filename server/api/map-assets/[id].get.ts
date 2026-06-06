import { createError, defineEventHandler, getRouterParam, setHeader } from 'h3'
import {
  getMapAssetMimeType,
  readLocalMapAssetFile,
} from '../../utils/localMapAssetStore'
import { readLocalMapState } from '../../utils/localMapStore'

export default defineEventHandler(async (event) => {
  const assetId = getRouterParam(event, 'id') ?? ''
  if (!/^[a-z0-9._-]+$/i.test(assetId)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Map asset not found',
    })
  }

  const state = await readLocalMapState()
  const isKnownMapAsset = state.mapLayers.some((layer) =>
    layer.visibility !== 'internal' &&
    layer.source === `/api/map-assets/${assetId}`,
  )
  if (!isKnownMapAsset) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Map asset not found',
    })
  }

  try {
    const buffer = await readLocalMapAssetFile(assetId)
    setHeader(event, 'content-type', getMapAssetMimeType(assetId))
    setHeader(event, 'cache-control', 'public, max-age=300')

    return buffer
  }
  catch {
    throw createError({
      statusCode: 404,
      statusMessage: 'Map asset file not found',
    })
  }
})
