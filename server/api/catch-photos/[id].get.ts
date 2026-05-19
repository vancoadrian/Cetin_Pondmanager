import { createError, defineEventHandler, getRouterParam, setHeader } from 'h3'
import { readLocalCatchState } from '../../utils/localCatchStore'
import { readLocalCatchPhotoFile } from '../../utils/localCatchPhotoStore'

export default defineEventHandler(async (event) => {
  const photoId = getRouterParam(event, 'id') ?? ''
  const state = await readLocalCatchState()
  const photo = state.catchPhotos.find((item) => item.id === photoId)

  if (!photo) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Catch photo not found',
    })
  }

  try {
    const buffer = await readLocalCatchPhotoFile(photo)
    setHeader(event, 'content-type', photo.mimeType)
    setHeader(event, 'cache-control', 'private, max-age=300')

    return buffer
  }
  catch {
    throw createError({
      statusCode: 404,
      statusMessage: 'Catch photo file not found',
    })
  }
})
