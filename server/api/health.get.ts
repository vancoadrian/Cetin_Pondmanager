import { defineEventHandler } from 'h3'
import type { SystemHealthResponse } from '~/services/observabilityService'
import { collectSystemHealth } from '../utils/systemHealth'

export default defineEventHandler(async (): Promise<SystemHealthResponse> => {
  return collectSystemHealth({ includePrivateDetails: false }) as Promise<SystemHealthResponse>
})
