import { defineEventHandler } from 'h3'
import { selectAnglerReservations } from '~/services/anglerAccountDataService'
import type { AnglerReservationsResponse } from '~/services/reservationApiService'
import { requireMockAnglerAccount } from '../../utils/anglerSession'
import { readLocalReservationState } from '../../utils/localReservationStore'

export default defineEventHandler(async (event): Promise<AnglerReservationsResponse> => {
  const account = await requireMockAnglerAccount(event)
  const state = await readLocalReservationState()
  const selection = selectAnglerReservations(account, state)

  return {
    account: {
      email: account.email,
      id: account.id,
      name: account.name,
    },
    ok: true,
    ...selection,
    updatedAt: state.updatedAt,
  }
})
