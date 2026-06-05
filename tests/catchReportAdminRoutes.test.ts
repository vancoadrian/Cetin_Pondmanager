import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, createRouter, toNodeListener } from 'h3'
import type { CatchSavedReport } from '~/app/data/pond'
import type {
  CatchReportEmailDraftSuccess,
  CatchReportGenerationSuccess,
  CatchReportMutationSuccess,
  CatchReportScheduleRunSuccess,
  CatchReportStateResponse,
} from '~/app/services/catchReportService'
import catchReportsGetHandler from '~/server/api/admin/catch-reports.get'
import catchReportsPostHandler from '~/server/api/admin/catch-reports.post'
import catchReportEmailDraftHandler from '~/server/api/admin/catch-reports/[id]/email-draft.post'
import catchReportGenerateHandler from '~/server/api/admin/catch-reports/[id]/generate.post'
import catchReportsRunDueHandler from '~/server/api/admin/catch-reports/run-due.post'
import { readLocalAuditLogState } from '~/server/utils/localAuditLogStore'
import { readLocalCatchReportState, writeLocalCatchReportState } from '~/server/utils/localCatchReportStore'

const MANAGER_COOKIE = 'rybolov_cetin_mock_session=manager'
const ACCOUNTANT_COOKIE = 'rybolov_cetin_mock_session=accountant'

const localEnvKeys = [
  'RYBOLOV_LOCAL_AUDIT_LOG_STORE',
  'RYBOLOV_LOCAL_CATCH_REPORT_STORE',
  'RYBOLOV_LOCAL_CATCH_STORE',
  'RYBOLOV_REPORT_DELIVERY_PROVIDER',
  'RYBOLOV_REPORT_EMAIL_FROM',
  'RYBOLOV_REPORT_EMAIL_REPLY_TO',
  'RYBOLOV_RESEND_API_ENDPOINT',
  'RYBOLOV_RESEND_API_KEY',
] as const

const originalEnv = new Map<string, string | undefined>()
let tempDir: string | undefined

interface TestRouteServer {
  baseUrl: string
  close: () => Promise<void>
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'rybolov-catch-report-admin-'))

  for (const key of localEnvKeys) {
    if (!originalEnv.has(key)) {
      originalEnv.set(key, process.env[key])
    }
  }

  const dataDir = join(tempDir, 'data')
  process.env.RYBOLOV_LOCAL_AUDIT_LOG_STORE = join(dataDir, 'audit-log.json')
  process.env.RYBOLOV_LOCAL_CATCH_REPORT_STORE = join(dataDir, 'catch-reports.json')
  process.env.RYBOLOV_LOCAL_CATCH_STORE = join(dataDir, 'catch-state.json')
  process.env.RYBOLOV_REPORT_DELIVERY_PROVIDER = 'mock'
  process.env.RYBOLOV_REPORT_EMAIL_FROM = 'Rybolov Cetín <reports@example.test>'
  process.env.RYBOLOV_REPORT_EMAIL_REPLY_TO = ''
  process.env.RYBOLOV_RESEND_API_ENDPOINT = 'https://api.resend.test/emails'
  process.env.RYBOLOV_RESEND_API_KEY = ''
})

afterEach(async () => {
  for (const key of localEnvKeys) {
    const original = originalEnv.get(key)

    if (original === undefined) {
      Reflect.deleteProperty(process.env, key)
    }
    else {
      process.env[key] = original
    }
  }

  if (tempDir) {
    await rm(tempDir, { force: true, recursive: true })
    tempDir = undefined
  }
})

function createCatchReportRouteServerApp() {
  const app = createApp()
  const router = createRouter()

  router.get('/api/admin/catch-reports', catchReportsGetHandler)
  router.post('/api/admin/catch-reports', catchReportsPostHandler)
  router.post('/api/admin/catch-reports/run-due', catchReportsRunDueHandler)
  router.post('/api/admin/catch-reports/:id/generate', catchReportGenerateHandler)
  router.post('/api/admin/catch-reports/:id/email-draft', catchReportEmailDraftHandler)
  app.use(router.handler)

  return app
}

async function startRouteServer(): Promise<TestRouteServer> {
  const server = createServer(toNodeListener(createCatchReportRouteServerApp()))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Testovací HTTP server nemá dostupný port.')
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  }
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

async function requestJson<T>(
  server: TestRouteServer,
  path: string,
  init: RequestInit & { cookie?: string | null } = {},
) {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')

  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  if (init.cookie !== null) {
    headers.set('cookie', init.cookie ?? MANAGER_COOKIE)
  }

  const response = await fetch(`${server.baseUrl}${path}`, {
    ...init,
    headers,
  })
  const raw = await response.text()
  const body = raw ? JSON.parse(raw) as T : null

  return {
    body,
    raw,
    response,
  }
}

function reportFixture(overrides: Partial<CatchSavedReport> = {}): CatchSavedReport {
  return {
    audience: 'owner',
    cadence: 'weekly',
    createdAt: '2026-05-01T08:00:00.000Z',
    delivery: 'email-ready',
    description: 'Automatický report pre majiteľa.',
    enabled: true,
    filter: {
      lake: 'all',
      seasonWindowId: 'custom',
    },
    id: 'catch-report-admin-owner',
    includeRawCsv: true,
    includeTrendSignals: true,
    lastGeneratedAt: '2026-05-01T08:00:00.000Z',
    recipients: ['majitel@example.test'],
    title: 'Admin report majiteľa',
    updatedAt: '2026-05-01T08:00:00.000Z',
    ...overrides,
  }
}

describe('admin catch report API routes', () => {
  it('allows read-only catch report access for the accountant role', async () => {
    await writeLocalCatchReportState({
      deliveryLogs: [],
      savedReports: [reportFixture()],
    })
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<CatchReportStateResponse>(
        server,
        '/api/admin/catch-reports',
        { cookie: ACCOUNTANT_COOKIE },
      )

      expect(response.status).toBe(200)
      expect(body?.savedReports).toHaveLength(1)
      expect(body?.savedReports[0]).toMatchObject({
        id: 'catch-report-admin-owner',
        title: 'Admin report majiteľa',
      })
    }
    finally {
      await server.close()
    }
  })

  it('blocks report mutations for read-only admin roles', async () => {
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<{ statusMessage: string }>(
        server,
        '/api/admin/catch-reports',
        {
          body: JSON.stringify({
            audience: 'owner',
            cadence: 'weekly',
            delivery: 'email-ready',
            enabled: true,
            filter: {
              lake: 'all',
              seasonWindowId: 'custom',
            },
            includeRawCsv: true,
            includeTrendSignals: true,
            recipients: ['majitel@example.test'],
            title: 'Blokovaný report',
          }),
          cookie: ACCOUNTANT_COOKIE,
          method: 'POST',
        },
      )

      expect(response.status).toBe(403)
      expect(body?.statusMessage).toBe('Admin access denied')
    }
    finally {
      await server.close()
    }
  })

  it('creates a saved catch report and writes an audit event', async () => {
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<CatchReportMutationSuccess>(
        server,
        '/api/admin/catch-reports',
        {
          body: JSON.stringify({
            audience: 'owner',
            cadence: 'weekly',
            delivery: 'email-ready',
            description: 'Týždenný automat pre majiteľa.',
            enabled: true,
            filter: {
              lake: 'velky-cetin',
              seasonWindowId: 'main-2026',
              species: 'Kapor',
            },
            includeRawCsv: true,
            includeTrendSignals: true,
            recipients: 'majitel@example.test, spravca@example.test',
            title: 'Týždenný report kaprov',
          }),
          method: 'POST',
        },
      )

      expect(response.status).toBe(201)
      expect(body?.report).toMatchObject({
        audience: 'owner',
        cadence: 'weekly',
        delivery: 'email-ready',
        filter: {
          lake: 'velky-cetin',
          seasonWindowId: 'main-2026',
          species: 'Kapor',
        },
        recipients: ['majitel@example.test', 'spravca@example.test'],
        title: 'Týždenný report kaprov',
      })

      const reportState = await readLocalCatchReportState()
      expect(reportState.savedReports[0]?.id).toBe(body?.report.id)

      const audit = await readLocalAuditLogState()
      expect(audit.events[0]).toMatchObject({
        action: 'catch.report.saved',
        actorId: 'manager',
        area: 'catches',
        details: {
          cadence: 'weekly',
          delivery: 'email-ready',
          recipients: 2,
          species: 'Kapor',
        },
        entityId: body?.report.id,
        severity: 'warning',
      })
    }
    finally {
      await server.close()
    }
  })

  it('returns validation errors from the save route', async () => {
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<{ data: { messages: string[] }, statusMessage: string }>(
        server,
        '/api/admin/catch-reports',
        {
          body: JSON.stringify({
            audience: 'owner',
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
          }),
          method: 'POST',
        },
      )

      expect(response.status).toBe(422)
      expect(body?.statusMessage).toBe('Catch report validation failed')
      expect(body?.data.messages).toContain('Report musí obsahovať aspoň CSV úlovkov alebo trendové signály.')
    }
    finally {
      await server.close()
    }
  })

  it('generates a saved catch report through the admin route', async () => {
    await writeLocalCatchReportState({
      deliveryLogs: [],
      savedReports: [reportFixture()],
    })
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<CatchReportGenerationSuccess>(
        server,
        '/api/admin/catch-reports/catch-report-admin-owner/generate',
        { method: 'POST' },
      )

      expect(response.status).toBe(200)
      expect(body?.generatedReport.rawCsv).toContain('Rybár')
      expect(body?.generatedReport.signalCsv).toContain('Sekcia')
      expect(body?.report.lastGeneratedAt).toBeDefined()

      const reportState = await readLocalCatchReportState()
      expect(reportState.savedReports[0]?.lastGeneratedAt).toBe(body?.report.lastGeneratedAt)

      const audit = await readLocalAuditLogState()
      expect(audit.events[0]).toMatchObject({
        action: 'catch.report.generated',
        actorId: 'manager',
        entityId: 'catch-report-admin-owner',
      })
    }
    finally {
      await server.close()
    }
  })

  it('prepares an email draft and delivery log through the admin route', async () => {
    await writeLocalCatchReportState({
      deliveryLogs: [],
      savedReports: [reportFixture()],
    })
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<CatchReportEmailDraftSuccess>(
        server,
        '/api/admin/catch-reports/catch-report-admin-owner/email-draft',
        { method: 'POST' },
      )

      expect(response.status).toBe(200)
      expect(body?.deliveryLog).toMatchObject({
        provider: 'mock',
        reportId: 'catch-report-admin-owner',
        status: 'prepared',
      })
      expect(body?.emailDraft.attachments.map((attachment) => attachment.fileName)).toEqual([
        expect.stringContaining('-ulovky.csv'),
        expect.stringContaining('-trendove-signaly.csv'),
      ])

      const reportState = await readLocalCatchReportState()
      expect(reportState.deliveryLogs[0]?.status).toBe('prepared')

      const audit = await readLocalAuditLogState()
      expect(audit.events[0]).toMatchObject({
        action: 'catch.report.email_draft.prepared',
        actorId: 'manager',
        details: {
          provider: 'mock',
          recipients: 1,
          status: 'prepared',
        },
        entityId: 'catch-report-admin-owner',
      })
    }
    finally {
      await server.close()
    }
  })

  it('runs due reports manually from the admin route with admin audit metadata', async () => {
    await writeLocalCatchReportState({
      deliveryLogs: [],
      savedReports: [reportFixture()],
    })
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<CatchReportScheduleRunSuccess>(
        server,
        '/api/admin/catch-reports/run-due',
        { method: 'POST' },
      )

      expect(response.status).toBe(200)
      expect(body?.rows[0]).toMatchObject({
        action: 'prepared',
        due: true,
        reportId: 'catch-report-admin-owner',
      })
      expect(body?.deliveryLogs[0]?.status).toBe('prepared')

      const audit = await readLocalAuditLogState()
      expect(audit.events[0]).toMatchObject({
        action: 'catch.report.schedule.run',
        actorId: 'manager',
        area: 'catches',
        details: {
          dueCount: 1,
          processedCount: 1,
          reportCount: 1,
          source: 'admin',
        },
        entityId: 'catch-report-scheduler',
      })
    }
    finally {
      await server.close()
    }
  })
})
