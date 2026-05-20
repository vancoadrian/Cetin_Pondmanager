import { defineEventHandler, setResponseStatus } from 'h3'
import type { CatchReportScheduleRunSuccess } from '~/services/catchReportService'
import { resolveAuditActor } from '../../../utils/auditActor'
import { runAndPersistCatchReportScheduler } from '../../../utils/catchReportSchedulerRunner'

export default defineEventHandler(async (event): Promise<CatchReportScheduleRunSuccess> => {
  const result = await runAndPersistCatchReportScheduler({
    actor: resolveAuditActor(event),
    source: 'admin',
  })
  setResponseStatus(event, result.statusCode)

  return result
})
