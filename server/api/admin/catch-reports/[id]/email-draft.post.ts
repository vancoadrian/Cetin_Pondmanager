import { createError, defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import {
  deliverCatchReportEmail,
  type CatchReportEmailDraftSuccess,
} from '~/services/catchReportService'
import { pondService } from '~/services/pondService'
import { requireAdminAccess } from '../../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../../utils/auditActor'
import { readLocalCatchState } from '../../../../utils/localCatchStore'
import { appendLocalAuditEvent } from '../../../../utils/localAuditLogStore'
import { readLocalCatchReportState, writeLocalCatchReportState } from '../../../../utils/localCatchReportStore'

export default defineEventHandler(async (event): Promise<CatchReportEmailDraftSuccess> => {
  requireAdminAccess(event, { moduleId: 'catches', mode: 'operate' })

  const reportId = getRouterParam(event, 'id') ?? ''
  const [reportState, catchState] = await Promise.all([
    readLocalCatchReportState(),
    readLocalCatchState(),
  ])
  const result = await deliverCatchReportEmail(
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
      statusMessage: 'Catch report email draft failed',
    })
  }

  await writeLocalCatchReportState({
    deliveryLogs: result.deliveryLogs,
    savedReports: result.savedReports,
  })
  await appendLocalAuditEvent({
    ...resolveAuditActor(event),
    action: 'catch.report.email_draft.prepared',
    area: 'catches',
    details: {
      attachmentCount: result.deliveryLog.attachmentCount,
      catchCount: result.generatedReport.summary.catchCount,
      provider: result.deliveryLog.provider,
      recipients: result.deliveryLog.recipients.length,
      status: result.deliveryLog.status,
      subject: result.deliveryLog.subject,
      totalWeightKg: result.generatedReport.summary.totalWeightKg,
    },
    entityId: result.report.id,
    entityLabel: result.report.title,
    entityType: 'catch_saved_report',
    summary: `Správca pripravil e-mailový draft reportu ${result.report.title}.`,
  })
  setResponseStatus(event, result.statusCode)

  return result
})
