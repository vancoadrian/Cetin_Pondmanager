import { describe, expect, it } from 'vitest'
import { catches } from '~/app/data/pond'
import {
  createCatchReportEmailDraft,
  createEmptyCatchReportState,
  deliverCatchReportEmail,
  generateCatchSavedReport,
  getCatchReportNextEligibleAt,
  isCatchReportDue,
  isCatchReportSchedulerSecretValid,
  prepareCatchReportEmailDraft,
  readCatchReportDeliveryProviderConfig,
  readCatchReportSchedulerConfig,
  runDueCatchReports,
  saveCatchSavedReport,
  type CatchReportState,
} from '~/app/services/catchReportService'

const now = '2026-05-19T08:00:00.000Z'

describe('catchReportService', () => {
  it('creates a saved catch report from the current analytics filter', () => {
    const result = saveCatchSavedReport(
      {
        audience: 'manager',
        cadence: 'weekly',
        delivery: 'email-ready',
        enabled: true,
        filter: {
          dateFrom: '2026-05-01',
          dateTo: '2026-05-31',
          lake: 'velky-cetin',
          seasonWindowId: 'main-2026',
          species: 'Kapor',
        },
        includeRawCsv: true,
        includeTrendSignals: true,
        recipients: 'spravca@example.test, majitel@example.test',
        title: 'Týždenný kaprový report',
      },
      createEmptyCatchReportState(),
      now,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Report should be valid.')

    expect(result.statusCode).toBe(201)
    expect(result.report.id).toBe('catch-report-20260519-tyzdenny-kaprovy-report')
    expect(result.report.recipients).toEqual(['spravca@example.test', 'majitel@example.test'])
    expect(result.report.filter).toMatchObject({
      dateFrom: '2026-05-01',
      lake: 'velky-cetin',
      seasonWindowId: 'main-2026',
      species: 'Kapor',
    })
    expect(result.savedReports).toHaveLength(1)
  })

  it('updates an existing saved report without changing its creation date', () => {
    const state: CatchReportState = {
      deliveryLogs: [],
      savedReports: [{
        audience: 'manager',
        cadence: 'weekly',
        createdAt: '2026-05-18T08:00:00.000Z',
        delivery: 'in-app',
        description: 'Pôvodný report.',
        enabled: true,
        filter: {
          lake: 'all',
          seasonWindowId: 'custom',
        },
        id: 'catch-report-test',
        includeRawCsv: true,
        includeTrendSignals: false,
        recipients: [],
        title: 'Pôvodný report',
        updatedAt: '2026-05-18T08:00:00.000Z',
      }],
    }
    const result = saveCatchSavedReport(
      {
        audience: 'accountant',
        cadence: 'monthly',
        delivery: 'email-ready',
        enabled: false,
        filter: {
          lake: 'all',
          seasonWindowId: 'custom',
          species: 'all',
        },
        id: 'catch-report-test',
        includeRawCsv: false,
        includeTrendSignals: true,
        recipients: ['uctovnik@example.test', 'uctovnik@example.test'],
        title: 'Mesačný report pre účtovníka',
      },
      state,
      now,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Report update should be valid.')

    expect(result.statusCode).toBe(200)
    expect(result.report.createdAt).toBe('2026-05-18T08:00:00.000Z')
    expect(result.report.updatedAt).toBe(now)
    expect(result.report.enabled).toBe(false)
    expect(result.report.recipients).toEqual(['uctovnik@example.test'])
    expect(result.report.filter.species).toBeUndefined()
    expect(result.savedReports).toHaveLength(1)
  })

  it('rejects report definitions without any payload', () => {
    const result = saveCatchSavedReport({
      audience: 'manager',
      cadence: 'manual',
      delivery: 'in-app',
      enabled: true,
      filter: {
        lake: 'all',
        seasonWindowId: 'custom',
      },
      includeRawCsv: false,
      includeTrendSignals: false,
      title: 'Prázdny report',
    }, createEmptyCatchReportState(), now)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Empty report should be invalid.')

    expect(result.messages).toContain('Report musí obsahovať aspoň CSV úlovkov alebo trendové signály.')
  })

  it('generates a report payload and marks the report as generated', () => {
    const state: CatchReportState = {
      deliveryLogs: [],
      savedReports: [{
        audience: 'owner',
        cadence: 'weekly',
        createdAt: '2026-05-18T08:00:00.000Z',
        delivery: 'email-ready',
        description: 'Report pre majiteľa.',
        enabled: true,
        filter: {
          lake: 'all',
          seasonWindowId: 'custom',
        },
        id: 'catch-report-owner',
        includeRawCsv: true,
        includeTrendSignals: true,
        recipients: ['majitel@example.test'],
        title: 'Týždenný report pre majiteľa',
        updatedAt: '2026-05-18T08:00:00.000Z',
      }],
    }
    const result = generateCatchSavedReport('catch-report-owner', state, catches, {
      getLakeName: (lake) => lake === 'velky-cetin' ? 'Veľký Cetín' : 'Štrkovisko Kocka',
      getPegLabel: (pegId) => `Miesto ${pegId}`,
    }, now)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Report generation should be valid.')

    expect(result.report.lastGeneratedAt).toBe(now)
    expect(result.generatedReport.summary.catchCount).toBeGreaterThan(0)
    expect(result.generatedReport.summary.trendSignalCount).toBeGreaterThan(0)
    expect(result.generatedReport.rawCsv).toContain('Rybár')
    expect(result.generatedReport.signalCsv).toContain('Sekcia')
    expect(result.savedReports[0]?.lastGeneratedAt).toBe(now)
  })

  it('returns a 404 validation result for an unknown report generation request', () => {
    const result = generateCatchSavedReport('missing-report', createEmptyCatchReportState(), catches, {}, now)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Missing report should not generate.')

    expect(result.statusCode).toBe(404)
    expect(result.messages).toContain('Uložený report sa nenašiel.')
  })

  it('creates an email draft with CSV attachments from a generated report', () => {
    const state: CatchReportState = {
      deliveryLogs: [],
      savedReports: [{
        audience: 'manager',
        cadence: 'manual',
        createdAt: '2026-05-18T08:00:00.000Z',
        delivery: 'email-ready',
        description: 'Report pre správcu.',
        enabled: true,
        filter: {
          lake: 'all',
          seasonWindowId: 'custom',
        },
        id: 'catch-report-email',
        includeRawCsv: true,
        includeTrendSignals: true,
        recipients: ['spravca@example.test'],
        title: 'Report na odoslanie',
        updatedAt: '2026-05-18T08:00:00.000Z',
      }],
    }
    const generated = generateCatchSavedReport('catch-report-email', state, catches, {}, now)
    if (!generated.ok) throw new Error('Report generation should be valid.')

    const draft = createCatchReportEmailDraft(generated.report, generated.generatedReport, now)

    expect(draft.subject).toBe('Rybolov Cetín: Report na odoslanie')
    expect(draft.recipients).toEqual(['spravca@example.test'])
    expect(draft.previewText).toContain('úlovkov')
    expect(draft.bodyText).toContain('Top druh')
    expect(draft.attachments.map((attachment) => attachment.fileName)).toEqual([
      '20260519-report-na-odoslanie-ulovky.csv',
      '20260519-report-na-odoslanie-trendove-signaly.csv',
    ])
  })

  it('prepares an email draft and appends a delivery log without sending email', () => {
    const state: CatchReportState = {
      deliveryLogs: [],
      savedReports: [{
        audience: 'owner',
        cadence: 'weekly',
        createdAt: '2026-05-18T08:00:00.000Z',
        delivery: 'email-ready',
        description: 'Report pre majiteľa.',
        enabled: true,
        filter: {
          lake: 'all',
          seasonWindowId: 'custom',
        },
        id: 'catch-report-delivery',
        includeRawCsv: true,
        includeTrendSignals: false,
        recipients: ['majitel@example.test'],
        title: 'Report pre doručenie',
        updatedAt: '2026-05-18T08:00:00.000Z',
      }],
    }
    const result = prepareCatchReportEmailDraft('catch-report-delivery', state, catches, {}, {
      from: 'Rybolov Cetín <reports@example.test>',
      provider: 'mock',
    }, now)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Email draft should be prepared.')

    expect(result.deliveryLog).toMatchObject({
      attachmentCount: 1,
      provider: 'mock',
      status: 'prepared',
      subject: 'Rybolov Cetín: Report pre doručenie',
    })
    expect(result.deliveryLogs).toHaveLength(1)
    expect(result.emailDraft.attachments[0]?.fileName).toContain('ulovky.csv')
    expect(result.savedReports[0]?.lastGeneratedAt).toBe(now)
  })

  it('parses report delivery provider configuration from env', () => {
    expect(readCatchReportDeliveryProviderConfig({
      RYBOLOV_REPORT_DELIVERY_PROVIDER: 'resend',
      RYBOLOV_RESEND_API_ENDPOINT: 'https://api.resend.test/emails',
      RYBOLOV_RESEND_API_KEY: 're_test',
      RYBOLOV_REPORT_EMAIL_FROM: 'Rybolov <rybolov@example.test>',
      RYBOLOV_REPORT_EMAIL_REPLY_TO: 'spravca@example.test',
    })).toEqual({
      apiKey: 're_test',
      endpoint: 'https://api.resend.test/emails',
      from: 'Rybolov <rybolov@example.test>',
      provider: 'resend',
      replyTo: 'spravca@example.test',
    })

    expect(readCatchReportDeliveryProviderConfig({
      RYBOLOV_REPORT_DELIVERY_PROVIDER: 'unknown',
    }).provider).toBe('mock')
  })

  it('parses and validates the catch report scheduler secret', () => {
    const config = readCatchReportSchedulerConfig({
      RYBOLOV_REPORT_SCHEDULER_SECRET: '  scheduler-secret  ',
    })

    expect(config).toEqual({
      cronSecret: 'scheduler-secret',
    })
    expect(readCatchReportSchedulerConfig({})).toEqual({
      cronSecret: undefined,
    })
    expect(isCatchReportSchedulerSecretValid('scheduler-secret', config)).toBe(true)
    expect(isCatchReportSchedulerSecretValid(' scheduler-secret ', config)).toBe(true)
    expect(isCatchReportSchedulerSecretValid('wrong-secret', config)).toBe(false)
    expect(isCatchReportSchedulerSecretValid(undefined, config)).toBe(false)
    expect(isCatchReportSchedulerSecretValid('scheduler-secret', { cronSecret: undefined })).toBe(false)
  })

  it('sends a report email through the Resend adapter when configured', async () => {
    const state: CatchReportState = {
      deliveryLogs: [],
      savedReports: [{
        audience: 'owner',
        cadence: 'weekly',
        createdAt: '2026-05-18T08:00:00.000Z',
        delivery: 'email-ready',
        description: 'Report pre majiteľa.',
        enabled: true,
        filter: {
          lake: 'all',
          seasonWindowId: 'custom',
        },
        id: 'catch-report-resend',
        includeRawCsv: true,
        includeTrendSignals: true,
        recipients: ['majitel@example.test'],
        title: 'Report cez Resend',
        updatedAt: '2026-05-18T08:00:00.000Z',
      }],
    }
    const requests: Array<{ headers: Headers, payload: Record<string, unknown>, url: string }> = []
    const fakeFetch: typeof fetch = async (input, init) => {
      requests.push({
        headers: new Headers(init?.headers),
        payload: JSON.parse(String(init?.body)) as Record<string, unknown>,
        url: String(input),
      })

      return new Response(JSON.stringify({ id: 'email-resend-test' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }
    const result = await deliverCatchReportEmail('catch-report-resend', state, catches, {
      fetcher: fakeFetch,
    }, {
      apiKey: 're_test',
      endpoint: 'https://api.resend.test/emails',
      from: 'Rybolov <reports@example.test>',
      provider: 'resend',
      replyTo: 'spravca@example.test',
    }, now)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Resend delivery should be valid.')

    expect(result.deliveryLog).toMatchObject({
      externalId: 'email-resend-test',
      provider: 'resend',
      status: 'sent',
    })
    expect(result.message).toBe('Report bol odoslaný cez Resend.')
    expect(requests[0]?.url).toBe('https://api.resend.test/emails')
    expect(requests[0]?.headers.get('Authorization')).toBe('Bearer re_test')
    expect(requests[0]?.payload).toMatchObject({
      from: 'Rybolov <reports@example.test>',
      subject: 'Rybolov Cetín: Report cez Resend',
      text: expect.stringContaining('Top druh'),
      to: ['majitel@example.test'],
    })
    expect(requests[0]?.payload.attachments).toEqual([
      expect.objectContaining({ filename: '20260519-report-cez-resend-ulovky.csv' }),
      expect.objectContaining({ filename: '20260519-report-cez-resend-trendove-signaly.csv' }),
    ])
  })

  it('records a failed Resend delivery when the API key is missing', async () => {
    const state: CatchReportState = {
      deliveryLogs: [],
      savedReports: [{
        audience: 'manager',
        cadence: 'manual',
        createdAt: '2026-05-18T08:00:00.000Z',
        delivery: 'email-ready',
        description: 'Report pre správcu.',
        enabled: true,
        filter: {
          lake: 'all',
          seasonWindowId: 'custom',
        },
        id: 'catch-report-resend-missing-key',
        includeRawCsv: true,
        includeTrendSignals: false,
        recipients: ['spravca@example.test'],
        title: 'Report bez kľúča',
        updatedAt: '2026-05-18T08:00:00.000Z',
      }],
    }
    const result = await deliverCatchReportEmail('catch-report-resend-missing-key', state, catches, {}, {
      endpoint: 'https://api.resend.test/emails',
      from: 'Rybolov <reports@example.test>',
      provider: 'resend',
    }, now)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Failed delivery should still return a delivery log.')

    expect(result.deliveryLog).toMatchObject({
      message: 'Chýba RYBOLOV_RESEND_API_KEY, e-mail nebol odoslaný.',
      provider: 'resend',
      status: 'failed',
    })
  })

  it('detects due dates for weekly saved reports', () => {
    const state: CatchReportState = {
      deliveryLogs: [],
      savedReports: [{
        audience: 'manager',
        cadence: 'weekly',
        createdAt: '2026-05-01T08:00:00.000Z',
        delivery: 'in-app',
        description: 'Report s periódou.',
        enabled: true,
        filter: {
          lake: 'all',
          seasonWindowId: 'custom',
        },
        id: 'catch-report-weekly-due',
        includeRawCsv: true,
        includeTrendSignals: true,
        lastGeneratedAt: '2026-05-12T08:00:00.000Z',
        recipients: [],
        title: 'Týždenný report',
        updatedAt: '2026-05-12T08:00:00.000Z',
      }],
    }
    const report = state.savedReports[0]
    if (!report) throw new Error('Report fixture should exist.')

    expect(getCatchReportNextEligibleAt(report, now)).toBe('2026-05-19T08:00:00.000Z')
    expect(isCatchReportDue(report, now)).toBe(true)

    const notYetDue = {
      ...report,
      lastGeneratedAt: '2026-05-18T08:00:00.000Z',
    }
    expect(getCatchReportNextEligibleAt(notYetDue, now)).toBe('2026-05-25T08:00:00.000Z')
    expect(isCatchReportDue(notYetDue, now)).toBe(false)
  })

  it('runs due weekly email reports through the mock delivery provider', async () => {
    const state: CatchReportState = {
      deliveryLogs: [],
      savedReports: [{
        audience: 'owner',
        cadence: 'weekly',
        createdAt: '2026-05-01T08:00:00.000Z',
        delivery: 'email-ready',
        description: 'Report pre majiteľa.',
        enabled: true,
        filter: {
          lake: 'all',
          seasonWindowId: 'custom',
        },
        id: 'catch-report-scheduler-email',
        includeRawCsv: true,
        includeTrendSignals: true,
        lastGeneratedAt: '2026-05-12T08:00:00.000Z',
        recipients: ['majitel@example.test'],
        title: 'Scheduler e-mail report',
        updatedAt: '2026-05-12T08:00:00.000Z',
      }],
    }
    const result = await runDueCatchReports(state, catches, {}, {
      endpoint: 'https://api.resend.test/emails',
      from: 'Rybolov <reports@example.test>',
      provider: 'mock',
    }, now)

    expect(result.ok).toBe(true)
    expect(result.deliveryProvider).toBe('mock')
    expect(result.dueCount).toBe(1)
    expect(result.failedCount).toBe(0)
    expect(result.preparedCount).toBe(1)
    expect(result.processedCount).toBe(1)
    expect(result.sentCount).toBe(0)
    expect(result.skippedCount).toBe(0)
    expect(result.rows[0]).toMatchObject({
      action: 'prepared',
      deliveryStatus: 'prepared',
      due: true,
      nextEligibleAt: '2026-05-26T08:00:00.000Z',
      reportId: 'catch-report-scheduler-email',
    })
    expect(result.deliveryLogs).toHaveLength(1)
    expect(result.deliveryLogs[0]?.status).toBe('prepared')
    expect(result.savedReports[0]?.lastGeneratedAt).toBe(now)
  })

  it('runs due weekly email reports through the Resend delivery provider', async () => {
    const state: CatchReportState = {
      deliveryLogs: [],
      savedReports: [{
        audience: 'owner',
        cadence: 'weekly',
        createdAt: '2026-05-01T08:00:00.000Z',
        delivery: 'email-ready',
        description: 'Report pre majiteľa.',
        enabled: true,
        filter: {
          lake: 'all',
          seasonWindowId: 'custom',
        },
        id: 'catch-report-scheduler-resend',
        includeRawCsv: true,
        includeTrendSignals: true,
        lastGeneratedAt: '2026-05-12T08:00:00.000Z',
        recipients: ['majitel@example.test'],
        title: 'Scheduler Resend report',
        updatedAt: '2026-05-12T08:00:00.000Z',
      }],
    }
    const requests: Array<{ headers: Headers, payload: Record<string, unknown>, url: string }> = []
    const fakeFetch: typeof fetch = async (input, init) => {
      requests.push({
        headers: new Headers(init?.headers),
        payload: JSON.parse(String(init?.body)) as Record<string, unknown>,
        url: String(input),
      })

      return new Response(JSON.stringify({ id: 'email-scheduler-resend-test' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }
    const result = await runDueCatchReports(state, catches, {
      fetcher: fakeFetch,
    }, {
      apiKey: 're_test',
      endpoint: 'https://api.resend.test/emails',
      from: 'Rybolov <reports@example.test>',
      provider: 'resend',
    }, now)

    expect(result.ok).toBe(true)
    expect(result.deliveryProvider).toBe('resend')
    expect(result.dueCount).toBe(1)
    expect(result.failedCount).toBe(0)
    expect(result.preparedCount).toBe(0)
    expect(result.processedCount).toBe(1)
    expect(result.sentCount).toBe(1)
    expect(result.skippedCount).toBe(0)
    expect(result.rows[0]).toMatchObject({
      action: 'sent',
      deliveryStatus: 'sent',
      due: true,
      nextEligibleAt: '2026-05-26T08:00:00.000Z',
      reportId: 'catch-report-scheduler-resend',
    })
    expect(result.deliveryLogs[0]).toMatchObject({
      externalId: 'email-scheduler-resend-test',
      provider: 'resend',
      status: 'sent',
    })
    expect(result.savedReports[0]?.lastGeneratedAt).toBe(now)
    expect(requests[0]?.url).toBe('https://api.resend.test/emails')
    expect(requests[0]?.headers.get('Authorization')).toBe('Bearer re_test')
    expect(requests[0]?.payload).toMatchObject({
      from: 'Rybolov <reports@example.test>',
      subject: 'Rybolov Cetín: Scheduler Resend report',
      to: ['majitel@example.test'],
    })
  })

  it('skips scheduled reports that are not due yet', async () => {
    const state: CatchReportState = {
      deliveryLogs: [],
      savedReports: [{
        audience: 'manager',
        cadence: 'weekly',
        createdAt: '2026-05-01T08:00:00.000Z',
        delivery: 'email-ready',
        description: 'Report čaká na termín.',
        enabled: true,
        filter: {
          lake: 'all',
          seasonWindowId: 'custom',
        },
        id: 'catch-report-scheduler-waiting',
        includeRawCsv: true,
        includeTrendSignals: false,
        lastGeneratedAt: '2026-05-18T08:00:00.000Z',
        recipients: ['spravca@example.test'],
        title: 'Čakajúci report',
        updatedAt: '2026-05-18T08:00:00.000Z',
      }],
    }
    const result = await runDueCatchReports(state, catches, {}, {
      endpoint: 'https://api.resend.test/emails',
      from: 'Rybolov <reports@example.test>',
      provider: 'mock',
    }, now)

    expect(result.dueCount).toBe(0)
    expect(result.deliveryProvider).toBe('mock')
    expect(result.failedCount).toBe(0)
    expect(result.preparedCount).toBe(0)
    expect(result.processedCount).toBe(0)
    expect(result.sentCount).toBe(0)
    expect(result.skippedCount).toBe(0)
    expect(result.rows[0]).toMatchObject({
      action: 'skipped',
      due: false,
      nextEligibleAt: '2026-05-25T08:00:00.000Z',
    })
    expect(result.deliveryLogs).toEqual([])
    expect(result.savedReports[0]?.lastGeneratedAt).toBe('2026-05-18T08:00:00.000Z')
  })

  it('runs due monthly in-app reports without creating a delivery log', async () => {
    const state: CatchReportState = {
      deliveryLogs: [],
      savedReports: [{
        audience: 'accountant',
        cadence: 'monthly',
        createdAt: '2026-05-01T08:00:00.000Z',
        delivery: 'in-app',
        description: 'Mesačný report pre účtovníka.',
        enabled: true,
        filter: {
          lake: 'all',
          seasonWindowId: 'custom',
        },
        id: 'catch-report-scheduler-monthly',
        includeRawCsv: true,
        includeTrendSignals: true,
        recipients: [],
        title: 'Mesačný report v appke',
        updatedAt: '2026-05-01T08:00:00.000Z',
      }],
    }
    const result = await runDueCatchReports(state, catches, {}, {
      endpoint: 'https://api.resend.test/emails',
      from: 'Rybolov <reports@example.test>',
      provider: 'mock',
    }, now)

    expect(result.dueCount).toBe(1)
    expect(result.deliveryProvider).toBe('mock')
    expect(result.failedCount).toBe(0)
    expect(result.preparedCount).toBe(0)
    expect(result.processedCount).toBe(1)
    expect(result.sentCount).toBe(0)
    expect(result.skippedCount).toBe(0)
    expect(result.rows[0]).toMatchObject({
      action: 'generated',
      due: true,
      nextEligibleAt: '2026-06-19T08:00:00.000Z',
    })
    expect(result.deliveryLogs).toEqual([])
    expect(result.savedReports[0]?.lastGeneratedAt).toBe(now)
  })
})
