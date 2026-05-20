import { defineEventHandler } from 'h3'
import type { CatchReportStateResponse } from '~/services/catchReportService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import { readLocalCatchReportState } from '../../utils/localCatchReportStore'

export default defineEventHandler(async (event): Promise<CatchReportStateResponse> => {
  requireAdminAccess(event, { moduleId: 'catches' })

  const state = await readLocalCatchReportState()

  return {
    deliveryLogs: state.deliveryLogs,
    ok: true,
    savedReports: state.savedReports,
    updatedAt: state.updatedAt,
  }
})
