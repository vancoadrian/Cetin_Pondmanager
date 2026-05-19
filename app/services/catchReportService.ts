import type {
  CatchSavedReport,
  CatchSavedReportAudience,
  CatchSavedReportCadence,
  CatchSavedReportDelivery,
  CatchSavedReportFilter,
} from '~/data/pond'
import { catchSavedReportInputSchema, getValidationMessages } from '~/schemas/pondSchemas'

export interface CatchReportState {
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

export function cloneCatchReportState(state: CatchReportState): CatchReportState {
  return {
    savedReports: state.savedReports.map(cloneReport),
  }
}

export function createEmptyCatchReportState(): CatchReportState {
  return {
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
