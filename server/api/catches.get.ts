import { defineEventHandler } from 'h3'
import { filterPublicCatchWorkflowState, type CatchStateResponse } from '~/services/catchApiService'
import { readLocalCatchState } from '../utils/localCatchStore'

export default defineEventHandler(async (): Promise<CatchStateResponse> => {
  const state = await readLocalCatchState()
  const publicState = filterPublicCatchWorkflowState(state)

  return {
    catchPhotos: publicState.catchPhotos,
    catches: publicState.catches,
    ok: true,
    tripLogbookEntries: publicState.tripLogbookEntries,
    tripLogbooks: publicState.tripLogbooks,
    updatedAt: state.updatedAt,
  }
})
