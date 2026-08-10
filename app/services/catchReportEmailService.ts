import type {
  CatchRecord,
  CatchReportDeliveryLog,
  CatchReportDeliveryProvider,
  CatchSavedReport,
} from '~/data/pond'
import {
  compactDate,
  failure,
  slugify,
  uniqueId,
  type CatchReportState,
  type CatchReportValidationFailure,
} from '~/services/catchReportService'
import {
  generateCatchSavedReport,
  type CatchGeneratedReport,
  type CatchReportGenerationOptions,
} from '~/services/catchReportGenerationService'

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

export interface CatchReportEmailDeliveryOptions extends CatchReportGenerationOptions {
  fetcher?: typeof fetch
}

export const catchReportDeliveryProviderLabels: Record<CatchReportDeliveryProvider, string> = {
  disabled: 'vypnuté',
  mock: 'draft v aplikácii',
  resend: 'Resend pripravený',
}

function compactTimestamp(value: string) {
  const timestamp = Date.parse(value)
  const date = Number.isFinite(timestamp) ? new Date(timestamp) : new Date()

  return date.toISOString().replace(/\D/g, '').slice(0, 14)
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
        ? 'E-mailový draft reportu je pripravený pre doručenie cez Resend.'
        : 'E-mailový draft je pripravený v aplikácii.',
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
          : 'E-mailový draft je pripravený v aplikácii.',
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
