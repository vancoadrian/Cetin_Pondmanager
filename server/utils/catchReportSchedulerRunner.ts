import {
  runDueCatchReports,
  type CatchReportEmailDeliveryOptions,
  type CatchReportScheduleRunSuccess,
} from '~/services/catchReportService'
import { pondService } from '~/services/pondService'
import type { AuditEventInput } from '~/services/auditLogService'
import { appendLocalAuditEvent } from './localAuditLogStore'
import { readLocalCatchReportState, writeLocalCatchReportState } from './localCatchReportStore'
import { readLocalCatchState } from './localCatchStore'

type AuditActor = Pick<AuditEventInput, 'actorId' | 'actorLabel' | 'actorRole'>

export interface CatchReportSchedulerRunOptions {
  actor: AuditActor
  deliveryOptions?: CatchReportEmailDeliveryOptions
  source: 'admin' | 'cron'
}

export async function runAndPersistCatchReportScheduler(
  options: CatchReportSchedulerRunOptions,
): Promise<CatchReportScheduleRunSuccess> {
  const [reportState, catchState] = await Promise.all([
    readLocalCatchReportState(),
    readLocalCatchState(),
  ])
  const result = await runDueCatchReports(
    reportState,
    catchState.catches,
    {
      getLakeName: pondService.getLakeName,
      getPegLabel: pondService.getPegLabel,
      ...options.deliveryOptions,
    },
  )

  await writeLocalCatchReportState({
    deliveryLogs: result.deliveryLogs,
    savedReports: result.savedReports,
  })
  await appendLocalAuditEvent({
    ...options.actor,
    action: 'catch.report.schedule.run',
    area: 'catches',
    details: {
      deliveryProvider: result.deliveryProvider,
      dueCount: result.dueCount,
      failedCount: result.failedCount,
      preparedCount: result.preparedCount,
      processedCount: result.processedCount,
      reportCount: result.rows.length,
      sentCount: result.sentCount,
      skippedCount: result.skippedCount,
      source: options.source,
    },
    entityId: 'catch-report-scheduler',
    entityLabel: 'Plánovač reportov úlovkov',
    entityType: 'catch_report_scheduler',
    severity: result.rows.some((row) => row.action === 'failed') ? 'warning' : 'info',
    summary: result.message,
  })

  return result
}
