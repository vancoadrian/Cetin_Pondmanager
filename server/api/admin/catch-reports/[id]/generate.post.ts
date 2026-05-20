import { createError, defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import {
  generateCatchSavedReport,
  type CatchReportGenerationSuccess,
} from '~/services/catchReportService'
import { pondService } from '~/services/pondService'
import { requireAdminAccess } from '../../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../../utils/auditActor'
import { readLocalCatchState } from '../../../../utils/localCatchStore'
import { appendLocalAuditEvent } from '../../../../utils/localAuditLogStore'
import { readLocalCatchReportState, writeLocalCatchReportState } from '../../../../utils/localCatchReportStore'

export default defineEventHandler(async (event): Promise<CatchReportGenerationSuccess> => {
  requireAdminAccess(event, { moduleId: 'catches', mode: 'operate' })

  const reportId = getRouterParam(event, 'id') ?? ''
  const [reportState, catchState] = await Promise.all([
    readLocalCatchReportState(),
    readLocalCatchState(),
  ])
  const result = generateCatchSavedReport(
    reportId,
    reportState,
    catchState.catches,
    {
      getLakeName: pondService.getLakeName,
      getPegLabel: pondService.getPegLabel,
    },
  )

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Catch report generation failed',
    })
  }

  await writeLocalCatchReportState({
    deliveryLogs: reportState.deliveryLogs,
    savedReports: result.savedReports,
  })
  await appendLocalAuditEvent({
    ...resolveAuditActor(event),
    action: 'catch.report.generated',
    area: 'catches',
    details: {
      catchCount: result.generatedReport.summary.catchCount,
      includeRawCsv: Boolean(result.generatedReport.rawCsv),
      includeTrendSignals: Boolean(result.generatedReport.signalCsv),
      period: result.generatedReport.summary.periodLabel,
      totalWeightKg: result.generatedReport.summary.totalWeightKg,
      trendSignalCount: result.generatedReport.summary.trendSignalCount,
    },
    entityId: result.report.id,
    entityLabel: result.report.title,
    entityType: 'catch_saved_report',
    summary: `Správca vygeneroval report úlovkov ${result.report.title}.`,
  })
  setResponseStatus(event, result.statusCode)

  return result
})
