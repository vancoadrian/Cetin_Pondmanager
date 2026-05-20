import { defineEventHandler } from 'h3'
import {
  sanitizePublicClosures,
  type ClosureStateResponse,
} from '~/services/closureApiService'
import { readLocalClosureState } from '../utils/localClosureStore'

export default defineEventHandler(async (): Promise<ClosureStateResponse> => {
  const state = await readLocalClosureState()

  return {
    lakeClosures: sanitizePublicClosures(state.lakeClosures),
    ok: true,
    updatedAt: state.updatedAt,
  }
})
