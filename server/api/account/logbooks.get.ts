import { defineEventHandler } from 'h3'
import type { AnglerLogbooksResponse } from '~/services/catchApiService'
import { requireMockAnglerAccount } from '../../utils/anglerSession'
import { readLocalCatchState } from '../../utils/localCatchStore'

export default defineEventHandler(async (event): Promise<AnglerLogbooksResponse> => {
  const account = requireMockAnglerAccount(event)
  const state = await readLocalCatchState()
  const tripLogbooks = state.tripLogbooks.filter((logbook) =>
    logbook.ownerUserId === account.id
    || logbook.members.some((member) => member.userId === account.id),
  )
  const logbookIds = new Set(tripLogbooks.map((logbook) => logbook.id))

  return {
    account,
    ok: true,
    tripLogbookEntries: state.tripLogbookEntries.filter((entry) => logbookIds.has(entry.logbookId)),
    tripLogbooks,
    updatedAt: state.updatedAt,
  }
})
