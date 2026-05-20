import {
  createError,
  defineEventHandler,
  getHeader,
  getMethod,
  setHeader,
  setResponseStatus,
} from 'h3'
import {
  isCatchReportSchedulerSecretValid,
  readCatchReportSchedulerConfig,
  type CatchReportScheduleRunSuccess,
} from '~/services/catchReportService'
import { createSystemAuditActor } from '../../../utils/auditActor'
import { runAndPersistCatchReportScheduler } from '../../../utils/catchReportSchedulerRunner'

function readSchedulerSecretFromRequest(event: Parameters<typeof getHeader>[0]) {
  const authorization = getHeader(event, 'authorization') ?? ''
  const bearerSecret = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  const headerSecret = getHeader(event, 'x-rybolov-cron-secret')?.trim()
    ?? getHeader(event, 'x-rybolov-scheduler-secret')?.trim()

  return bearerSecret || headerSecret || undefined
}

export default defineEventHandler(async (event): Promise<CatchReportScheduleRunSuccess> => {
  const method = getMethod(event)
  if (method !== 'GET' && method !== 'POST') {
    setHeader(event, 'Allow', 'GET, POST')
    throw createError({
      statusCode: 405,
      statusMessage: 'Method not allowed',
    })
  }

  const config = readCatchReportSchedulerConfig()
  if (!config.cronSecret) {
    throw createError({
      data: { messages: ['Cron plánovač reportov nemá nastavený RYBOLOV_REPORT_SCHEDULER_SECRET.'] },
      statusCode: 503,
      statusMessage: 'Catch report scheduler is not configured',
    })
  }

  const providedSecret = readSchedulerSecretFromRequest(event)
  if (!isCatchReportSchedulerSecretValid(providedSecret, config)) {
    throw createError({
      data: { messages: ['Cron secret pre plánovač reportov nie je platný.'] },
      statusCode: 401,
      statusMessage: 'Unauthorized catch report scheduler run',
    })
  }

  const result = await runAndPersistCatchReportScheduler({
    actor: createSystemAuditActor('Cron plánovač reportov'),
    source: 'cron',
  })
  setResponseStatus(event, result.statusCode)

  return result
})
