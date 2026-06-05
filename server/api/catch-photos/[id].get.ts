import { createError, defineEventHandler, getRouterParam, setHeader } from 'h3'
import { getAdminApiAccessDecision } from '~/utils/adminAccess'
import { resolveMockAdminRole } from '../../utils/adminAccessGuard'
import { readLocalCatchState } from '../../utils/localCatchStore'
import { readLocalCatchPhotoFile } from '../../utils/localCatchPhotoStore'

export default defineEventHandler(async (event) => {
  const photoId = getRouterParam(event, 'id') ?? ''
  const state = await readLocalCatchState()
  const photo = state.catchPhotos.find((item) => item.id === photoId)
  const catchRecord = photo
    ? state.catches.find((item) => item.id === photo.catchId)
    : undefined

  if (!photo || !catchRecord) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Catch photo not found',
    })
  }

  const adminDecision = getAdminApiAccessDecision(resolveMockAdminRole(event), { moduleId: 'catches' })
  if (catchRecord.status !== 'approved' && !adminDecision.allowed) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Catch photo not available',
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
