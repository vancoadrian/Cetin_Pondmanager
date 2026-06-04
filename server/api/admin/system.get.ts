import { defineEventHandler } from 'h3'
import type { AdminSystemHealthResponse } from '~/services/observabilityService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import { collectSystemHealth } from '../../utils/systemHealth'

export default defineEventHandler(async (event): Promise<AdminSystemHealthResponse> => {
  requireAdminAccess(event, { moduleId: 'system' })

  return collectSystemHealth({ includePrivateDetails: true }) as Promise<AdminSystemHealthResponse>
})
