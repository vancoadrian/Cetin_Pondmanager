import type {
  CatchRecord,
  CatchReportDeliveryLog,
  CatchReportDeliveryProvider,
  CatchReportDeliveryStatus,
  CatchSavedReport,
  CatchSavedReportAudience,
  CatchSavedReportCadence,
  CatchSavedReportDelivery,
  CatchSavedReportFilter,
  LakeSlug,
} from '~/data/pond'
import { catchSavedReportInputSchema, getValidationMessages } from '~/schemas/pondSchemas'
import {
  createCatchAnalytics,
  createCatchCsvExport,
  createCatchMonthlyTrend,
  createCatchSeasonComparison,
  createCatchSpeciesPegTrend,
  createCatchSpeciesTrend,
  createCatchTrendSignalCsvExport,
  createCatchTrendSignalRows,
  filterCatchesForAnalytics,
  type CatchTrendSignalRow,
} from '~/utils/catchAnalytics'

export interface CatchReportState {
  deliveryLogs: CatchReportDeliveryLog[]
  savedReports: CatchSavedReport[]
}

export interface CatchReportStateResponse extends CatchReportState {
  ok: true
  updatedAt: string
}

export interface CatchReportValidationFailure {
  messages: string[]
  ok: false
  statusCode: 400 | 404 | 422
}

export interface CatchReportMutationSuccess {
  message: string
  ok: true
  report: CatchSavedReport
  savedReports: CatchSavedReport[]
  statusCode: 200 | 201
}

export type CatchReportMutationResult = CatchReportMutationSuccess | CatchReportValidationFailure

export interface CatchGeneratedReport {
  generatedAt: string
  rawCsv?: string
  reportId: string
  signalCsv?: string
  summary: {
    averageWeightKg: number
    catchCount: number
    largestCatchLabel: string
    periodLabel: string
    releaseRatePercent: number
    topBaitLabel: string
    topPegLabel: string
    topSpeciesLabel: string
    totalWeightKg: number
    trendSignalCount: number
  }
  trendSignals: CatchTrendSignalRow[]
}

export interface CatchReportGenerationSuccess {
  generatedReport: CatchGeneratedReport
  message: string
  ok: true
  report: CatchSavedReport
  savedReports: CatchSavedReport[]
  statusCode: 200
}

export type CatchReportGenerationResult = CatchReportGenerationSuccess | CatchReportValidationFailure

export interface CatchReportEmailAttachment {
  content: string
  fileName: string
  mimeType: 'text/csv'
}

export interface CatchReportEmailDraft {
  attachments: CatchReportEmailAttachment[]
  bodyText: string
  generatedAt: string
  previewText: string
  recipients: string[]
  reportId: string
  subject: string
}

export interface CatchReportDeliveryProviderConfig {
  apiKey?: string
  endpoint: string
  from: string
  provider: CatchReportDeliveryProvider
  replyTo?: string
}

export interface CatchReportSchedulerConfig {
  cronSecret?: string
}

export interface CatchReportEmailDraftSuccess {
  deliveryLog: CatchReportDeliveryLog
  emailDraft: CatchReportEmailDraft
  generatedReport: CatchGeneratedReport
  message: string
  ok: true
  report: CatchSavedReport
  savedReports: CatchSavedReport[]
  deliveryLogs: CatchReportDeliveryLog[]
  statusCode: 200
}

export type CatchReportEmailDraftResult = CatchReportEmailDraftSuccess | CatchReportValidationFailure

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
  dueCount: number
  message: string
  ok: true
  processedCount: number
  rows: CatchReportScheduleRunRow[]
  savedReports: CatchSavedReport[]
  statusCode: 200
}

export interface CatchReportEmailDeliveryOptions extends CatchReportGenerationOptions {
  fetcher?: typeof fetch
}

export interface CatchReportGenerationOptions {
  getLakeName?: (lake: LakeSlug) => string
  getPegLabel?: (pegId: string) => string
}

export const catchReportAudienceLabels: Record<CatchSavedReportAudience, string> = {
  accountant: 'účtovník',
  manager: 'správca',
  owner: 'majiteľ',
}

export const catchReportCadenceLabels: Record<CatchSavedReportCadence, string> = {
  manual: 'ručne',
  monthly: 'mesačne',
  weekly: 'týždenne',
}

export const catchReportDeliveryLabels: Record<CatchSavedReportDelivery, string> = {
  'email-ready': 'pripraviť pre e-mail',
  'in-app': 'iba v aplikácii',
}

export const catchReportDeliveryProviderLabels: Record<CatchReportDeliveryProvider, string> = {
  disabled: 'vypnuté',
  mock: 'mock draft',
  resend: 'Resend pripravený',
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function failure(
  messages: string[],
  statusCode: CatchReportValidationFailure['statusCode'] = 422,
): CatchReportValidationFailure {
  return {
    messages: unique(messages),
    ok: false,
    statusCode,
  }
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'report'
}

function compactDate(value: string) {
  const timestamp = Date.parse(value)
  const date = Number.isFinite(timestamp) ? new Date(timestamp) : new Date()

  return date.toISOString().slice(0, 10).replaceAll('-', '')
}

function compactTimestamp(value: string) {
  const timestamp = Date.parse(value)
  const date = Number.isFinite(timestamp) ? new Date(timestamp) : new Date()

  return date.toISOString().replace(/\D/g, '').slice(0, 14)
}

function uniqueId(baseId: string, existingIds: Set<string>) {
  if (!existingIds.has(baseId)) return baseId

  let index = 2
  while (existingIds.has(`${baseId}-${index}`)) {
    index += 1
  }

  return `${baseId}-${index}`
}

function normalizeRecipients(value: string | string[] | undefined) {
  const recipients = Array.isArray(value)
    ? value
    : (value ?? '').split(/[\n,;]+/)

  return unique(
    recipients
      .map((recipient) => recipient.trim())
      .filter(Boolean),
  )
}

function normalizeFilter(filter: CatchSavedReportFilter): CatchSavedReportFilter {
  const species = filter.species?.trim()

  return {
    dateFrom: filter.dateFrom || undefined,
    dateTo: filter.dateTo || undefined,
    lake: filter.lake,
    seasonWindowId: filter.seasonWindowId || 'custom',
    species: species && species !== 'all' ? species : undefined,
  }
}

function createReportId(title: string, state: CatchReportState, now: string) {
  const baseId = `catch-report-${compactDate(now)}-${slugify(title).slice(0, 34)}`

  return uniqueId(baseId, new Set(state.savedReports.map((report) => report.id)))
}

function cloneReport(report: CatchSavedReport): CatchSavedReport {
  return {
    ...report,
    filter: { ...report.filter },
    recipients: [...report.recipients],
  }
}

function cloneDeliveryLog(log: CatchReportDeliveryLog): CatchReportDeliveryLog {
  return {
    ...log,
    recipients: [...log.recipients],
  }
}

function formatReportPeriod(filter: CatchSavedReportFilter) {
  if (filter.dateFrom && filter.dateTo) return `${filter.dateFrom} až ${filter.dateTo}`
  if (filter.dateFrom) return `od ${filter.dateFrom}`
  if (filter.dateTo) return `do ${filter.dateTo}`

  return 'všetky schválené úlovky'
}

function reportFilterToAnalyticsFilter(filter: CatchSavedReportFilter) {
  return {
    dateFrom: filter.dateFrom,
    dateTo: filter.dateTo,
    lake: filter.lake,
    species: filter.species,
    statuses: ['approved' as const],
  }
}

function updateReportInState(
  state: CatchReportState,
  report: CatchSavedReport,
) {
  return state.savedReports.map((item) => item.id === report.id ? report : item)
}

function createDeliveryLogId(reportId: string, state: CatchReportState, now: string) {
  const baseId = `catch-report-delivery-${compactTimestamp(now)}-${slugify(reportId).slice(0, 30)}`

  return uniqueId(baseId, new Set(state.deliveryLogs.map((log) => log.id)))
}

function formatWeight(value: number) {
  return `${value.toLocaleString('sk-SK', { maximumFractionDigits: 1 })} kg`
}

function attachmentFileBase(report: CatchSavedReport, now: string) {
  return `${compactDate(now)}-${slugify(report.title).slice(0, 36)}`
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

export function readCatchReportDeliveryProviderConfig(
  env: Record<string, string | undefined> = process.env,
): CatchReportDeliveryProviderConfig {
  const provider = env.RYBOLOV_REPORT_DELIVERY_PROVIDER
  const normalizedProvider = provider === 'disabled' || provider === 'resend' || provider === 'mock'
    ? provider
    : 'mock'

  return {
    apiKey: env.RYBOLOV_RESEND_API_KEY || undefined,
    endpoint: env.RYBOLOV_RESEND_API_ENDPOINT || 'https://api.resend.com/emails',
    from: env.RYBOLOV_REPORT_EMAIL_FROM || 'Rybolov Cetín <reports@rybolov-cetin.local>',
    provider: normalizedProvider,
    replyTo: env.RYBOLOV_REPORT_EMAIL_REPLY_TO || undefined,
  }
}

export function createCatchReportEmailDraft(
  report: CatchSavedReport,
  generatedReport: CatchGeneratedReport,
  now = new Date().toISOString(),
): CatchReportEmailDraft {
  const summary = generatedReport.summary
  const fileBase = attachmentFileBase(report, now)
  const attachments: CatchReportEmailAttachment[] = [
    ...(generatedReport.rawCsv
      ? [{
          content: generatedReport.rawCsv,
          fileName: `${fileBase}-ulovky.csv`,
          mimeType: 'text/csv' as const,
        }]
      : []),
    ...(generatedReport.signalCsv
      ? [{
          content: generatedReport.signalCsv,
          fileName: `${fileBase}-trendove-signaly.csv`,
          mimeType: 'text/csv' as const,
        }]
      : []),
  ]
  const subject = `Rybolov Cetín: ${report.title}`
  const previewText = `${summary.catchCount} úlovkov, ${formatWeight(summary.totalWeightKg)}, ${summary.trendSignalCount} signálov`
  const bodyText = [
    `Dobrý deň,`,
    ``,
    `posielame report úlovkov "${report.title}".`,
    ``,
    `Obdobie: ${summary.periodLabel}`,
    `Počet úlovkov: ${summary.catchCount}`,
    `Celková váha: ${formatWeight(summary.totalWeightKg)}`,
    `Priemer: ${formatWeight(summary.averageWeightKg)}`,
    `Pustené späť: ${summary.releaseRatePercent} %`,
    `Najväčší úlovok: ${summary.largestCatchLabel}`,
    `Top druh: ${summary.topSpeciesLabel}`,
    `Top miesto: ${summary.topPegLabel}`,
    `Top nástraha: ${summary.topBaitLabel}`,
    `Trendové signály: ${summary.trendSignalCount}`,
    ``,
    attachments.length > 0
      ? `Prílohy: ${attachments.map((attachment) => attachment.fileName).join(', ')}`
      : `Prílohy: bez príloh podľa nastavenia reportu`,
    ``,
    `Tento e-mail je pripravený aplikáciou Rybolov Cetín.`,
  ].join('\n')

  return {
    attachments,
    bodyText,
    generatedAt: now,
    previewText,
    recipients: [...report.recipients],
    reportId: report.id,
    subject,
  }
}

function encodeAttachmentContent(content: string) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(content, 'utf8').toString('base64')
  }

  const bytes = new TextEncoder().encode(content)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

function htmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#039;')
}

function emailBodyToHtml(bodyText: string) {
  return `<pre style="font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; white-space: pre-wrap;">${htmlEscape(bodyText)}</pre>`
}

async function sendViaResend(
  emailDraft: CatchReportEmailDraft,
  providerConfig: CatchReportDeliveryProviderConfig,
  fetcher: typeof fetch = fetch,
) {
  if (!providerConfig.apiKey) {
    return {
      externalId: undefined,
      message: 'Chýba RYBOLOV_RESEND_API_KEY, e-mail nebol odoslaný.',
      status: 'failed' as const,
    }
  }

  if (emailDraft.recipients.length === 0) {
    return {
      externalId: undefined,
      message: 'Report nemá príjemcov, e-mail nebol odoslaný.',
      status: 'failed' as const,
    }
  }

  const response = await fetcher(providerConfig.endpoint, {
    body: JSON.stringify({
      attachments: emailDraft.attachments.map((attachment) => ({
        content: encodeAttachmentContent(attachment.content),
        filename: attachment.fileName,
      })),
      from: providerConfig.from,
      html: emailBodyToHtml(emailDraft.bodyText),
      reply_to: providerConfig.replyTo,
      subject: emailDraft.subject,
      tags: [
        {
          name: 'category',
          value: 'catch_report',
        },
        {
          name: 'report_id',
          value: emailDraft.reportId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 256),
        },
      ],
      text: emailDraft.bodyText,
      to: emailDraft.recipients,
    }),
    headers: {
      Authorization: `Bearer ${providerConfig.apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `${emailDraft.reportId}-${emailDraft.generatedAt}`,
    },
    method: 'POST',
  })
  const payload = await response.json().catch(() => undefined) as { id?: string, message?: string } | undefined

  if (!response.ok) {
    return {
      externalId: payload?.id,
      message: payload?.message ?? `Resend vrátil HTTP ${response.status}.`,
      status: 'failed' as const,
    }
  }

  return {
    externalId: payload?.id,
    message: 'Report bol odoslaný cez Resend.',
    status: 'sent' as const,
  }
}

export function cloneCatchReportState(state: CatchReportState): CatchReportState {
  return {
    deliveryLogs: state.deliveryLogs.map(cloneDeliveryLog),
    savedReports: state.savedReports.map(cloneReport),
  }
}

export function createEmptyCatchReportState(): CatchReportState {
  return {
    deliveryLogs: [],
    savedReports: [],
  }
}

export function saveCatchSavedReport(
  rawInput: unknown,
  state: CatchReportState = createEmptyCatchReportState(),
  now = new Date().toISOString(),
): CatchReportMutationResult {
  const inputResult = catchSavedReportInputSchema.safeParse(rawInput)
  if (!inputResult.success) {
    return failure(getValidationMessages(inputResult))
  }

  const input = inputResult.data
  const existingReport = input.id
    ? state.savedReports.find((report) => report.id === input.id)
    : undefined

  if (input.id && !existingReport) {
    return failure(['Uložený report sa v lokálnom store nenašiel.'], 404)
  }

  const report: CatchSavedReport = {
    audience: input.audience,
    cadence: input.cadence,
    createdAt: existingReport?.createdAt ?? now,
    delivery: input.delivery,
    description: input.description?.trim() || 'Uložený report z aktuálneho filtra úlovkov.',
    enabled: input.enabled,
    filter: normalizeFilter(input.filter),
    id: existingReport?.id ?? createReportId(input.title, state, now),
    includeRawCsv: input.includeRawCsv,
    includeTrendSignals: input.includeTrendSignals,
    lastGeneratedAt: existingReport?.lastGeneratedAt,
    recipients: normalizeRecipients(input.recipients),
    title: input.title.trim(),
    updatedAt: now,
  }
  const savedReports = existingReport
    ? state.savedReports.map((item) => item.id === report.id ? report : item)
    : [report, ...state.savedReports]

  return {
    message: existingReport
      ? 'Uložený report je aktualizovaný.'
      : 'Report je uložený a pripravený na manuálne alebo plánované odosielanie.',
    ok: true,
    report,
    savedReports,
    statusCode: existingReport ? 200 : 201,
  }
}

export function generateCatchSavedReport(
  reportId: string,
  state: CatchReportState,
  catches: CatchRecord[],
  options: CatchReportGenerationOptions = {},
  now = new Date().toISOString(),
): CatchReportGenerationResult {
  const existingReport = state.savedReports.find((report) => report.id === reportId)
  if (!existingReport) {
    return failure(['Uložený report sa v lokálnom store nenašiel.'], 404)
  }

  const report: CatchSavedReport = {
    ...cloneReport(existingReport),
    lastGeneratedAt: now,
    updatedAt: now,
  }
  const analyticsFilter = reportFilterToAnalyticsFilter(report.filter)
  const filteredCatches = filterCatchesForAnalytics(catches, analyticsFilter)
  const analytics = createCatchAnalytics(filteredCatches, options)
  const seasonComparison = createCatchSeasonComparison(catches, analyticsFilter)
  const monthlyTrend = createCatchMonthlyTrend(catches, analyticsFilter)
  const speciesTrend = createCatchSpeciesTrend(catches, analyticsFilter)
  const speciesPegTrend = createCatchSpeciesPegTrend(catches, analyticsFilter, {
    getPegLabel: options.getPegLabel,
  })
  const trendSignals = createCatchTrendSignalRows({
    monthlyTrend,
    seasonComparison,
    speciesPegTrend,
    speciesTrend,
  })
  const generatedReport: CatchGeneratedReport = {
    generatedAt: now,
    rawCsv: report.includeRawCsv
      ? createCatchCsvExport(filteredCatches, options)
      : undefined,
    reportId: report.id,
    signalCsv: report.includeTrendSignals
      ? createCatchTrendSignalCsvExport(trendSignals)
      : undefined,
    summary: {
      averageWeightKg: analytics.averageWeightKg,
      catchCount: analytics.catchCount,
      largestCatchLabel: analytics.largestCatch
        ? `${analytics.largestCatch.species} ${analytics.largestCatch.weightKg} kg`
        : 'bez úlovku',
      periodLabel: formatReportPeriod(report.filter),
      releaseRatePercent: analytics.releaseRatePercent,
      topBaitLabel: analytics.topBaits[0]?.label ?? 'bez dát',
      topPegLabel: analytics.topPegs[0]?.label ?? 'bez dát',
      topSpeciesLabel: analytics.topSpecies[0]?.label ?? 'bez dát',
      totalWeightKg: analytics.totalWeightKg,
      trendSignalCount: trendSignals.length,
    },
    trendSignals,
  }

  return {
    generatedReport,
    message: 'Report je vygenerovaný a pripravený na odoslanie alebo export.',
    ok: true,
    report,
    savedReports: updateReportInState(state, report),
    statusCode: 200,
  }
}

export function prepareCatchReportEmailDraft(
  reportId: string,
  state: CatchReportState,
  catches: CatchRecord[],
  options: CatchReportGenerationOptions = {},
  providerConfig = readCatchReportDeliveryProviderConfig(),
  now = new Date().toISOString(),
): CatchReportEmailDraftResult {
  const generated = generateCatchSavedReport(reportId, state, catches, options, now)
  if (!generated.ok) return generated

  if (generated.report.delivery !== 'email-ready') {
    return failure(['Report nie je nastavený na e-mailový výstup.'], 422)
  }

  const emailDraft = createCatchReportEmailDraft(generated.report, generated.generatedReport, now)
  const deliveryLog: CatchReportDeliveryLog = {
    attachmentCount: emailDraft.attachments.length,
    createdAt: now,
    id: createDeliveryLogId(reportId, state, now),
    message: providerConfig.provider === 'disabled'
      ? 'Doručovanie reportov je vypnuté, e-mailový draft ostal iba v aplikácii.'
      : providerConfig.provider === 'resend'
        ? 'Resend provider je pripravený, v prototype sa e-mail ešte neodosiela.'
        : 'E-mailový draft je pripravený v lokálnom logu.',
    provider: providerConfig.provider,
    recipients: emailDraft.recipients,
    reportId,
    status: providerConfig.provider === 'disabled' ? 'skipped' : 'prepared',
    subject: emailDraft.subject,
  }

  return {
    deliveryLog,
    deliveryLogs: [deliveryLog, ...state.deliveryLogs].slice(0, 100),
    emailDraft,
    generatedReport: generated.generatedReport,
    message: deliveryLog.message,
    ok: true,
    report: generated.report,
    savedReports: generated.savedReports,
    statusCode: 200,
  }
}

export async function deliverCatchReportEmail(
  reportId: string,
  state: CatchReportState,
  catches: CatchRecord[],
  options: CatchReportEmailDeliveryOptions = {},
  providerConfig = readCatchReportDeliveryProviderConfig(),
  now = new Date().toISOString(),
): Promise<CatchReportEmailDraftResult> {
  const generated = generateCatchSavedReport(reportId, state, catches, options, now)
  if (!generated.ok) return generated

  if (generated.report.delivery !== 'email-ready') {
    return failure(['Report nie je nastavený na e-mailový výstup.'], 422)
  }

  const emailDraft = createCatchReportEmailDraft(generated.report, generated.generatedReport, now)
  const deliveryResult = providerConfig.provider === 'resend'
    ? await sendViaResend(emailDraft, providerConfig, options.fetcher)
    : {
        externalId: undefined,
        message: providerConfig.provider === 'disabled'
          ? 'Doručovanie reportov je vypnuté, e-mailový draft ostal iba v aplikácii.'
          : 'E-mailový draft je pripravený v lokálnom logu.',
        status: providerConfig.provider === 'disabled' ? 'skipped' as const : 'prepared' as const,
      }
  const deliveryLog: CatchReportDeliveryLog = {
    attachmentCount: emailDraft.attachments.length,
    createdAt: now,
    externalId: deliveryResult.externalId,
    id: createDeliveryLogId(reportId, state, now),
    message: deliveryResult.message,
    provider: providerConfig.provider,
    recipients: emailDraft.recipients,
    reportId,
    status: deliveryResult.status,
    subject: emailDraft.subject,
  }

  return {
    deliveryLog,
    deliveryLogs: [deliveryLog, ...state.deliveryLogs].slice(0, 100),
    emailDraft,
    generatedReport: generated.generatedReport,
    message: deliveryLog.message,
    ok: true,
    report: generated.report,
    savedReports: generated.savedReports,
    statusCode: 200,
  }
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
  const message = dueCount === 0
    ? 'Plánovač nenašiel žiadny splatný týždenný alebo mesačný report.'
    : failedCount > 0
      ? `Plánovač spracoval ${dueCount} reportov, ${failedCount} skončilo chybou.`
      : `Plánovač spracoval ${dueCount} reportov.`

  return {
    deliveryLogs: currentState.deliveryLogs,
    dueCount,
    message,
    ok: true,
    processedCount,
    rows,
    savedReports: currentState.savedReports,
    statusCode: 200,
  }
}
