import { defineEventHandler } from 'h3'
import {
  createPublicReservationState,
  type PublicReservationStateResponse,
} from '~/services/publicAvailabilityService'
import { readLocalReservationState } from '../utils/localReservationStore'

export default defineEventHandler(async (): Promise<PublicReservationStateResponse> => {
  const state = await readLocalReservationState()

  return createPublicReservationState(state)
})
