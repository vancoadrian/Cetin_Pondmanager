import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, toNodeListener } from 'h3'
import type { CatchSavedReport } from '~/app/data/pond'
import type { CatchReportScheduleRunSuccess } from '~/app/services/catchReportService'
import catchReportCronHandler from '~/server/api/cron/catch-reports/run-due'
import { readLocalAuditLogState } from '~/server/utils/localAuditLogStore'
import { readLocalCatchReportState, writeLocalCatchReportState } from '~/server/utils/localCatchReportStore'

const cronRoutePath = '/api/cron/catch-reports/run-due'

const localEnvKeys = [
  'RYBOLOV_LOCAL_AUDIT_LOG_STORE',
  'RYBOLOV_LOCAL_CATCH_REPORT_STORE',
  'RYBOLOV_LOCAL_CATCH_STORE',
  'RYBOLOV_REPORT_DELIVERY_PROVIDER',
  'RYBOLOV_REPORT_EMAIL_FROM',
  'RYBOLOV_REPORT_EMAIL_REPLY_TO',
  'RYBOLOV_REPORT_SCHEDULER_SECRET',
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
  tempDir = await mkdtemp(join(tmpdir(), 'rybolov-catch-report-cron-'))

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
  Reflect.deleteProperty(process.env, 'RYBOLOV_REPORT_SCHEDULER_SECRET')
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

function createCronRouteServerApp() {
  const app = createApp()

  app.use(cronRoutePath, catchReportCronHandler)

  return app
}

async function startRouteServer(): Promise<TestRouteServer> {
  const server = createServer(toNodeListener(createCronRouteServerApp()))
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
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')

  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const response = await fetch(`${server.baseUrl}${cronRoutePath}`, {
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

function scheduledReportFixture(overrides: Partial<CatchSavedReport> = {}): CatchSavedReport {
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
    id: 'catch-report-cron-owner',
    includeRawCsv: true,
    includeTrendSignals: true,
    lastGeneratedAt: '2026-05-01T08:00:00.000Z',
    recipients: ['majitel@example.test'],
    title: 'Cron report majiteľa',
    updatedAt: '2026-05-01T08:00:00.000Z',
    ...overrides,
  }
}

describe('catch report cron API route', () => {
  it('returns 503 when the scheduler secret is not configured', async () => {
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<{ data: { messages: string[] }, statusMessage: string }>(server)

      expect(response.status).toBe(503)
      expect(body?.statusMessage).toBe('Catch report scheduler is not configured')
      expect(body?.data.messages).toContain('Cron plánovač reportov nemá nastavený RYBOLOV_REPORT_SCHEDULER_SECRET.')
    }
    finally {
      await server.close()
    }
  })

  it('rejects requests with a missing or invalid cron secret', async () => {
    process.env.RYBOLOV_REPORT_SCHEDULER_SECRET = 'cron-secret'
    const server = await startRouteServer()

    try {
      const missingSecret = await requestJson<{ data: { messages: string[] }, statusMessage: string }>(server)
      expect(missingSecret.response.status).toBe(401)
      expect(missingSecret.body?.statusMessage).toBe('Unauthorized catch report scheduler run')

      const invalidSecret = await requestJson<{ data: { messages: string[] }, statusMessage: string }>(server, {
        headers: {
          Authorization: 'Bearer wrong-secret',
        },
      })
      expect(invalidSecret.response.status).toBe(401)
      expect(invalidSecret.body?.data.messages).toContain('Cron secret pre plánovač reportov nie je platný.')
    }
    finally {
      await server.close()
    }
  })

  it('rejects unsupported methods before running the scheduler', async () => {
    process.env.RYBOLOV_REPORT_SCHEDULER_SECRET = 'cron-secret'
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<{ statusMessage: string }>(server, {
        headers: {
          Authorization: 'Bearer cron-secret',
        },
        method: 'PUT',
      })

      expect(response.status).toBe(405)
      expect(response.headers.get('allow')).toBe('GET, POST')
      expect(body?.statusMessage).toBe('Method not allowed')

      const audit = await readLocalAuditLogState()
      expect(audit.events).toEqual([])
    }
    finally {
      await server.close()
    }
  })

  it('runs due catch reports with a bearer cron secret and writes audit metadata', async () => {
    process.env.RYBOLOV_REPORT_SCHEDULER_SECRET = 'cron-secret'
    await writeLocalCatchReportState({
      deliveryLogs: [],
      savedReports: [scheduledReportFixture()],
    })
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<CatchReportScheduleRunSuccess>(server, {
        headers: {
          Authorization: 'Bearer cron-secret',
        },
        method: 'POST',
      })

      expect(response.status).toBe(200)
      expect(body?.deliveryProvider).toBe('mock')
      expect(body?.dueCount).toBe(1)
      expect(body?.failedCount).toBe(0)
      expect(body?.preparedCount).toBe(1)
      expect(body?.processedCount).toBe(1)
      expect(body?.sentCount).toBe(0)
      expect(body?.skippedCount).toBe(0)
      expect(body?.rows[0]).toMatchObject({
        action: 'prepared',
        deliveryStatus: 'prepared',
        due: true,
        reportId: 'catch-report-cron-owner',
      })
      expect(body?.deliveryLogs[0]).toMatchObject({
        provider: 'mock',
        reportId: 'catch-report-cron-owner',
        status: 'prepared',
      })

      const reportState = await readLocalCatchReportState()
      expect(reportState.savedReports[0]?.lastGeneratedAt).toBeDefined()
      expect(reportState.deliveryLogs[0]?.status).toBe('prepared')

      const audit = await readLocalAuditLogState()
      expect(audit.events[0]).toMatchObject({
        action: 'catch.report.schedule.run',
        actorId: 'system',
        area: 'catches',
        details: {
          deliveryProvider: 'mock',
          dueCount: 1,
          failedCount: 0,
          preparedCount: 1,
          processedCount: 1,
          reportCount: 1,
          sentCount: 0,
          skippedCount: 0,
          source: 'cron',
        },
        entityId: 'catch-report-scheduler',
        severity: 'info',
      })
    }
    finally {
      await server.close()
    }
  })

  it('accepts the x-rybolov-cron-secret header for hosting cron jobs', async () => {
    process.env.RYBOLOV_REPORT_SCHEDULER_SECRET = 'cron-secret'
    await writeLocalCatchReportState({
      deliveryLogs: [],
      savedReports: [scheduledReportFixture({
        delivery: 'in-app',
        id: 'catch-report-cron-in-app',
        recipients: [],
      })],
    })
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<CatchReportScheduleRunSuccess>(server, {
        headers: {
          'x-rybolov-cron-secret': 'cron-secret',
        },
      })

      expect(response.status).toBe(200)
      expect(body?.deliveryProvider).toBe('mock')
      expect(body?.failedCount).toBe(0)
      expect(body?.preparedCount).toBe(0)
      expect(body?.sentCount).toBe(0)
      expect(body?.skippedCount).toBe(0)
      expect(body?.rows[0]).toMatchObject({
        action: 'generated',
        due: true,
        reportId: 'catch-report-cron-in-app',
      })
      expect(body?.deliveryLogs).toEqual([])
    }
    finally {
      await server.close()
    }
  })
})
