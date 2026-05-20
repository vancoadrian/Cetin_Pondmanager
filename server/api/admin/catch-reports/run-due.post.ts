import { defineEventHandler, setResponseStatus } from 'h3'
import type { CatchReportScheduleRunSuccess } from '~/services/catchReportService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../utils/auditActor'
import { runAndPersistCatchReportScheduler } from '../../../utils/catchReportSchedulerRunner'

export default defineEventHandler(async (event): Promise<CatchReportScheduleRunSuccess> => {
  requireAdminAccess(event, { moduleId: 'catches', mode: 'operate' })

  const result = await runAndPersistCatchReportScheduler({
    actor: resolveAuditActor(event),
    source: 'admin',
  })
  setResponseStatus(event, result.statusCode)

  return result
})
