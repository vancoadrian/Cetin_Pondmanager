import { defineEventHandler } from 'h3'
import type { CatchStateResponse } from '~/services/catchApiService'
import { readLocalCatchState } from '../utils/localCatchStore'

export default defineEventHandler(async (): Promise<CatchStateResponse> => {
  const state = await readLocalCatchState()

  return {
    catchPhotos: state.catchPhotos,
    catches: state.catches,
    ok: true,
    tripLogbookEntries: state.tripLogbookEntries,
    tripLogbooks: state.tripLogbooks,
    updatedAt: state.updatedAt,
  }
})
