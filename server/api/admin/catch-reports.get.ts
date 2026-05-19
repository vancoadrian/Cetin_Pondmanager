import { defineEventHandler } from 'h3'
import type { CatchReportStateResponse } from '~/services/catchReportService'
import { readLocalCatchReportState } from '../../utils/localCatchReportStore'

export default defineEventHandler(async (): Promise<CatchReportStateResponse> => {
  const state = await readLocalCatchReportState()

  return {
    ok: true,
    savedReports: state.savedReports,
    updatedAt: state.updatedAt,
  }
})
