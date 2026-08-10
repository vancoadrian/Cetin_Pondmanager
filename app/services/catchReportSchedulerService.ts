import type {
  CatchRecord,
  CatchReportDeliveryLog,
  CatchReportDeliveryProvider,
  CatchReportDeliveryStatus,
  CatchSavedReport,
  CatchSavedReportCadence,
  CatchSavedReportDelivery,
} from '~/data/pond'
import { cloneCatchReportState, type CatchReportState } from '~/services/catchReportService'
import { generateCatchSavedReport } from '~/services/catchReportGenerationService'
import {
  deliverCatchReportEmail,
  readCatchReportDeliveryProviderConfig,
  type CatchReportEmailDeliveryOptions,
} from '~/services/catchReportEmailService'

export interface CatchReportSchedulerConfig {
  cronSecret?: string
}

export type CatchReportScheduleAction = 'failed' | 'generated' | 'prepared' | 'sent' | 'skipped'

export interface CatchReportScheduleRunRow {
  action: CatchReportScheduleAction
  cadence: CatchSavedReportCadence
  delivery: CatchSavedReportDelivery
  deliveryStatus?: CatchReportDeliveryStatus
  due: boolean
  enabled: boolean
  generatedAt?: string
  lastGeneratedAt?: string
  message: string
  nextEligibleAt?: string
  reportId: string
  title: string
}

export interface CatchReportScheduleRunSuccess {
  deliveryLogs: CatchReportDeliveryLog[]
  deliveryProvider: CatchReportDeliveryProvider
  dueCount: number
  failedCount: number
  message: string
  ok: true
  preparedCount: number
  processedCount: number
  rows: CatchReportScheduleRunRow[]
  savedReports: CatchSavedReport[]
  sentCount: number
  skippedCount: number
  statusCode: 200
}

function parseIsoDate(value?: string) {
  if (!value) return undefined

  const timestamp = Date.parse(value)

  return Number.isFinite(timestamp) ? new Date(timestamp) : undefined
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date)
  nextDate.setUTCDate(nextDate.getUTCDate() + days)

  return nextDate
}

function addMonthsClamped(date: Date, months: number) {
  const targetMonthIndex = date.getUTCMonth() + months
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12)
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12
  const targetMonthLastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const targetDay = Math.min(date.getUTCDate(), targetMonthLastDay)

  return new Date(Date.UTC(
    targetYear,
    targetMonth,
    targetDay,
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  ))
}

export function getCatchReportNextEligibleAt(
  report: CatchSavedReport,
  now = new Date().toISOString(),
) {
  if (!report.enabled || report.cadence === 'manual') return undefined

  const nowDate = parseIsoDate(now) ?? new Date()
  const lastGeneratedAt = parseIsoDate(report.lastGeneratedAt)
  if (!lastGeneratedAt) return nowDate.toISOString()

  const nextDate = report.cadence === 'weekly'
    ? addDays(lastGeneratedAt, 7)
    : addMonthsClamped(lastGeneratedAt, 1)

  return nextDate.toISOString()
}

export function isCatchReportDue(
  report: CatchSavedReport,
  now = new Date().toISOString(),
) {
  const nextEligibleAt = getCatchReportNextEligibleAt(report, now)
  if (!nextEligibleAt) return false

  const nextTimestamp = Date.parse(nextEligibleAt)
  const nowTimestamp = Date.parse(now)
  if (!Number.isFinite(nextTimestamp)) return false

  return nextTimestamp <= (Number.isFinite(nowTimestamp) ? nowTimestamp : Date.now())
}

export function readCatchReportSchedulerConfig(
  env: Record<string, string | undefined> = process.env,
): CatchReportSchedulerConfig {
  return {
    cronSecret: env.RYBOLOV_REPORT_SCHEDULER_SECRET?.trim() || undefined,
  }
}

export function isCatchReportSchedulerSecretValid(
  providedSecret: string | undefined,
  config = readCatchReportSchedulerConfig(),
) {
  const expectedSecret = config.cronSecret?.trim()
  const normalizedProvidedSecret = providedSecret?.trim()
  if (!expectedSecret || !normalizedProvidedSecret) return false

  let mismatch = expectedSecret.length ^ normalizedProvidedSecret.length
  const maxLength = Math.max(expectedSecret.length, normalizedProvidedSecret.length)

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= expectedSecret.charCodeAt(index) ^ normalizedProvidedSecret.charCodeAt(index)
  }

  return mismatch === 0
}

export async function runDueCatchReports(
  state: CatchReportState,
  catches: CatchRecord[],
  options: CatchReportEmailDeliveryOptions = {},
  providerConfig = readCatchReportDeliveryProviderConfig(),
  now = new Date().toISOString(),
): Promise<CatchReportScheduleRunSuccess> {
  let currentState = cloneCatchReportState(state)
  const rows: CatchReportScheduleRunRow[] = []
  const scheduledReports = currentState.savedReports.filter((report) => report.cadence !== 'manual')

  for (const report of scheduledReports) {
    const due = isCatchReportDue(report, now)
    const baseRow = {
      cadence: report.cadence,
      delivery: report.delivery,
      due,
      enabled: report.enabled,
      lastGeneratedAt: report.lastGeneratedAt,
      nextEligibleAt: getCatchReportNextEligibleAt(report, now),
      reportId: report.id,
      title: report.title,
    }

    if (!report.enabled) {
      rows.push({
        ...baseRow,
        action: 'skipped',
        message: 'Report je pozastavený.',
      })
      continue
    }

    if (!due) {
      rows.push({
        ...baseRow,
        action: 'skipped',
        message: 'Report ešte nie je splatný.',
      })
      continue
    }

    if (report.delivery === 'email-ready') {
      const result = await deliverCatchReportEmail(report.id, currentState, catches, options, providerConfig, now)
      if (!result.ok) {
        rows.push({
          ...baseRow,
          action: 'failed',
          message: result.messages.join(' '),
        })
        continue
      }

      currentState = {
        deliveryLogs: result.deliveryLogs,
        savedReports: result.savedReports,
      }
      rows.push({
        ...baseRow,
        action: result.deliveryLog.status === 'sent'
          ? 'sent'
          : result.deliveryLog.status === 'failed'
            ? 'failed'
            : result.deliveryLog.status === 'skipped'
              ? 'skipped'
              : 'prepared',
        deliveryStatus: result.deliveryLog.status,
        generatedAt: result.generatedReport.generatedAt,
        message: result.message,
        nextEligibleAt: getCatchReportNextEligibleAt(result.report, now),
      })
      continue
    }

    const result = generateCatchSavedReport(report.id, currentState, catches, options, now)
    if (!result.ok) {
      rows.push({
        ...baseRow,
        action: 'failed',
        message: result.messages.join(' '),
      })
      continue
    }

    currentState = {
      deliveryLogs: currentState.deliveryLogs,
      savedReports: result.savedReports,
    }
    rows.push({
      ...baseRow,
      action: 'generated',
      generatedAt: result.generatedReport.generatedAt,
      message: `Report bol vygenerovaný v aplikácii (${result.generatedReport.summary.catchCount} úlovkov).`,
      nextEligibleAt: getCatchReportNextEligibleAt(result.report, now),
    })
  }

  const dueCount = rows.filter((row) => row.due).length
  const processedCount = dueCount
  const failedCount = rows.filter((row) => row.due && row.action === 'failed').length
  const preparedCount = rows.filter((row) => row.due && row.action === 'prepared').length
  const sentCount = rows.filter((row) => row.due && row.action === 'sent').length
  const skippedCount = rows.filter((row) => row.due && row.action === 'skipped').length
  const message = dueCount === 0
    ? 'Plánovač nenašiel žiadny splatný týždenný alebo mesačný report.'
    : failedCount > 0
      ? `Plánovač spracoval ${dueCount} reportov, ${failedCount} skončilo chybou.`
      : `Plánovač spracoval ${dueCount} reportov.`

  return {
    deliveryLogs: currentState.deliveryLogs,
    deliveryProvider: providerConfig.provider,
    dueCount,
    failedCount,
    message,
    ok: true,
    preparedCount,
    processedCount,
    rows,
    savedReports: currentState.savedReports,
    sentCount,
    skippedCount,
    statusCode: 200,
  }
}
