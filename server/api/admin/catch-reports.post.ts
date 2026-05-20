import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import {
  saveCatchSavedReport,
  type CatchReportMutationSuccess,
} from '~/services/catchReportService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../utils/auditActor'
import { appendLocalAuditEvent } from '../../utils/localAuditLogStore'
import { readLocalCatchReportState, writeLocalCatchReportState } from '../../utils/localCatchReportStore'

export default defineEventHandler(async (event): Promise<CatchReportMutationSuccess> => {
  requireAdminAccess(event, { moduleId: 'catches', mode: 'operate' })

  const state = await readLocalCatchReportState()
  const result = saveCatchSavedReport(await readBody(event), state)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Catch report validation failed',
    })
  }

  await writeLocalCatchReportState({
    deliveryLogs: state.deliveryLogs,
    savedReports: result.savedReports,
  })
  await appendLocalAuditEvent({
    ...resolveAuditActor(event),
    action: 'catch.report.saved',
    area: 'catches',
    details: {
      audience: result.report.audience,
      cadence: result.report.cadence,
      delivery: result.report.delivery,
      enabled: result.report.enabled,
      includeRawCsv: result.report.includeRawCsv,
      includeTrendSignals: result.report.includeTrendSignals,
      lake: result.report.filter.lake,
      recipients: result.report.recipients.length,
      seasonWindowId: result.report.filter.seasonWindowId,
      species: result.report.filter.species ?? 'all',
    },
    entityId: result.report.id,
    entityLabel: result.report.title,
    entityType: 'catch_saved_report',
    severity: result.report.enabled && result.report.cadence !== 'manual' ? 'warning' : 'info',
    summary: `Správca uložil report úlovkov ${result.report.title}.`,
  })
  setResponseStatus(event, result.statusCode)

  return result
})
