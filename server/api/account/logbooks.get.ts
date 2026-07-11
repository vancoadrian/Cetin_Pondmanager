import { defineEventHandler } from 'h3'
import type { AnglerLogbooksResponse } from '~/services/catchApiService'
import { selectAnglerLogbooks } from '~/services/anglerAccountDataService'
import { requireMockAnglerAccount } from '../../utils/anglerSession'
import { readLocalCatchState } from '../../utils/localCatchStore'

export default defineEventHandler(async (event): Promise<AnglerLogbooksResponse> => {
  const account = await requireMockAnglerAccount(event)
  const state = await readLocalCatchState()
  const selection = selectAnglerLogbooks(account, state)

  return {
    account,
    ok: true,
    ...selection,
    updatedAt: state.updatedAt,
  }
})
