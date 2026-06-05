import { createError, defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import {
  lookupTripLogbookByShareCode,
  type TripLogbookLookupSuccess,
} from '~/services/catchApiService'
import { readLocalCatchState } from '../../utils/localCatchStore'

export default defineEventHandler(async (event): Promise<TripLogbookLookupSuccess> => {
  const result = lookupTripLogbookByShareCode(getRouterParam(event, 'code'), await readLocalCatchState())

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Trip logbook lookup failed',
    })
  }

  setResponseStatus(event, result.statusCode)

  return result
})
