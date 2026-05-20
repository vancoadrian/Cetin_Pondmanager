import { defineEventHandler } from 'h3'
import type { PublicNotificationStateResponse } from '~/services/notificationService'
import { createPublicNotificationStateResponse } from '~/services/notificationService'
import { readLocalNotificationState } from '../utils/localNotificationStore'

export default defineEventHandler(async (): Promise<PublicNotificationStateResponse> => {
  const state = await readLocalNotificationState()

  return createPublicNotificationStateResponse(state, state.updatedAt)
})
