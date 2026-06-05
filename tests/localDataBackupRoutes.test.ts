import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, createRouter, toNodeListener } from 'h3'
import {
  LOCAL_DATA_BACKUP_CLEANUP_CONFIRMATION,
  LOCAL_DATA_RESTORE_CONFIRMATION,
  type LocalDataExportPayload,
  type LocalDataImportPreviewResponse,
  type LocalDataSafetyBackupArchiveResponse,
  type LocalDataSafetyBackupCleanupResponse,
} from '~/app/services/localDataExportService'
import dataBackupsIndexHandler from '~/server/api/admin/data-backups/index.get'
import dataBackupCleanupHandler from '~/server/api/admin/data-backups/cleanup.post'
import dataExportHandler from '~/server/api/admin/data-export.get'
import dataImportPreviewHandler from '~/server/api/admin/data-import/preview.post'
import dataImportRestoreHandler from '~/server/api/admin/data-import/restore.post'
import { createLocalDataExportPayload } from '~/server/utils/localDataExport'
import { readLocalAuditLogState } from '~/server/utils/localAuditLogStore'

const ADMIN_COOKIE = 'rybolov_cetin_mock_session=owner'

const localDataEnvKeys = [
  'RYBOLOV_LOCAL_AUDIT_LOG_STORE',
  'RYBOLOV_LOCAL_CABIN_CATALOG_STORE',
  'RYBOLOV_LOCAL_CATCH_PHOTO_DIR',
  'RYBOLOV_LOCAL_CATCH_REPORT_STORE',
  'RYBOLOV_LOCAL_CATCH_STORE',
  'RYBOLOV_LOCAL_CLOSURE_STORE',
  'RYBOLOV_LOCAL_DATA_DIR',
  'RYBOLOV_LOCAL_ERROR_LOG_STORE',
  'RYBOLOV_LOCAL_MAP_ASSET_DIR',
  'RYBOLOV_LOCAL_MAP_STORE',
  'RYBOLOV_LOCAL_NOTIFICATION_STORE',
  'RYBOLOV_LOCAL_PAYMENT_METHOD_STORE',
  'RYBOLOV_LOCAL_RENTAL_CATALOG_STORE',
  'RYBOLOV_LOCAL_RESERVATION_STORE',
  'RYBOLOV_LOCAL_SPONSOR_ASSET_DIR',
  'RYBOLOV_LOCAL_SPONSOR_STORE',
  'RYBOLOV_LOCAL_TOURNAMENT_STORE',
] as const

const originalEnv = new Map<string, string | undefined>()
let tempDir: string | undefined

interface TestRouteServer {
  baseUrl: string
  close: () => Promise<void>
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'rybolov-data-routes-'))

  for (const key of localDataEnvKeys) {
    if (!originalEnv.has(key)) {
      originalEnv.set(key, process.env[key])
    }
  }

  const dataDir = join(tempDir, 'data')
  process.env.RYBOLOV_LOCAL_DATA_DIR = dataDir
  process.env.RYBOLOV_LOCAL_AUDIT_LOG_STORE = join(dataDir, 'audit-log.json')
  process.env.RYBOLOV_LOCAL_CABIN_CATALOG_STORE = join(dataDir, 'cabin-catalog.json')
  process.env.RYBOLOV_LOCAL_CATCH_PHOTO_DIR = join(dataDir, 'catch-photos')
  process.env.RYBOLOV_LOCAL_CATCH_REPORT_STORE = join(dataDir, 'catch-reports.json')
  process.env.RYBOLOV_LOCAL_CATCH_STORE = join(dataDir, 'catch-state.json')
  process.env.RYBOLOV_LOCAL_CLOSURE_STORE = join(dataDir, 'closure-state.json')
  process.env.RYBOLOV_LOCAL_ERROR_LOG_STORE = join(dataDir, 'error-log.json')
  process.env.RYBOLOV_LOCAL_MAP_ASSET_DIR = join(dataDir, 'map-assets')
  process.env.RYBOLOV_LOCAL_MAP_STORE = join(dataDir, 'map-state.json')
  process.env.RYBOLOV_LOCAL_NOTIFICATION_STORE = join(dataDir, 'notification-state.json')
  process.env.RYBOLOV_LOCAL_PAYMENT_METHOD_STORE = join(dataDir, 'payment-methods.json')
  process.env.RYBOLOV_LOCAL_RENTAL_CATALOG_STORE = join(dataDir, 'rental-catalog.json')
  process.env.RYBOLOV_LOCAL_RESERVATION_STORE = join(dataDir, 'reservation-state.json')
  process.env.RYBOLOV_LOCAL_SPONSOR_ASSET_DIR = join(dataDir, 'sponsor-assets')
  process.env.RYBOLOV_LOCAL_SPONSOR_STORE = join(dataDir, 'sponsor-state.json')
  process.env.RYBOLOV_LOCAL_TOURNAMENT_STORE = join(dataDir, 'tournament-state.json')
})

afterEach(async () => {
  for (const key of localDataEnvKeys) {
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

function createDataRouteServerApp() {
  const app = createApp()
  const router = createRouter()

  router.get('/api/admin/data-export', dataExportHandler)
  router.post('/api/admin/data-import/preview', dataImportPreviewHandler)
  router.post('/api/admin/data-import/restore', dataImportRestoreHandler)
  router.get('/api/admin/data-backups', dataBackupsIndexHandler)
  router.post('/api/admin/data-backups/cleanup', dataBackupCleanupHandler)
  app.use(router.handler)

  return app
}

async function startRouteServer(): Promise<TestRouteServer> {
  const server = createServer(toNodeListener(createDataRouteServerApp()))
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
  init: RequestInit & { admin?: boolean } = {},
) {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')

  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  if (init.admin !== false) {
    headers.set('cookie', ADMIN_COOKIE)
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

async function writeSafetyBackupFixture(directory: string, exportedAt: string, reservationId: string) {
  const payload = await createLocalDataExportPayload({
    assetDefinitions: [],
    assetPolicy: 'none',
    exportedAt,
    mode: 'full',
    storeDefinitions: [
      {
        id: 'reservations',
        label: 'Rezervácie',
        path: join(directory, 'reservation-state.json'),
        read: async () => ({
          reservations: [{ id: reservationId }],
          updatedAt: exportedAt,
          version: 1,
        }),
      },
    ],
  })
  const fileName = `restore-safety-${exportedAt.slice(0, 19).replaceAll(':', '-')}.json`

  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, fileName), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

describe('local data backup API routes', () => {
  it('requires a full system admin session for local data export', async () => {
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<{ statusCode: number, statusMessage: string }>(
        server,
        '/api/admin/data-export?mode=summary',
        { admin: false },
      )

      expect(response.status).toBe(401)
      expect(body?.statusMessage).toBe('Admin login required')
    }
    finally {
      await server.close()
    }
  })

  it('exports and previews a full local backup through HTTP routes', async () => {
    const server = await startRouteServer()

    try {
      const exportResult = await requestJson<LocalDataExportPayload>(
        server,
        '/api/admin/data-export?mode=full&assets=none',
      )

      expect(exportResult.response.status).toBe(200)
      expect(exportResult.body?.mode).toBe('full')
      expect(exportResult.body?.assetPolicy).toBe('none')
      expect(exportResult.body?.integrity?.checksum).toMatch(/^[a-f0-9]{64}$/)
      expect(exportResult.body?.data).toBeDefined()

      const previewResult = await requestJson<LocalDataImportPreviewResponse>(
        server,
        '/api/admin/data-import/preview',
        {
          body: JSON.stringify(exportResult.body),
          method: 'POST',
        },
      )

      expect(previewResult.response.status).toBe(200)
      expect(previewResult.body?.status).toBe('ready')
      expect(previewResult.body?.integrity).toMatchObject({
        algorithm: 'sha256',
        status: 'verified',
      })

      const audit = await readLocalAuditLogState()
      expect(audit.events[0]?.action).toBe('system.data_import.previewed')
      expect(audit.events[0]?.details.status).toBe('ready')
    }
    finally {
      await server.close()
    }
  })

  it('rejects restore without phrase and restores with a safety backup when confirmed', async () => {
    const server = await startRouteServer()

    try {
      const exportResult = await requestJson<LocalDataExportPayload>(
        server,
        '/api/admin/data-export?mode=full&assets=none',
      )
      const rejectedRestore = await requestJson<{ statusCode: number, statusMessage: string }>(
        server,
        '/api/admin/data-import/restore',
        {
          body: JSON.stringify({
            backup: exportResult.body,
            confirmPhrase: 'ANO',
          }),
          method: 'POST',
        },
      )

      expect(rejectedRestore.response.status).toBe(422)
      expect(rejectedRestore.body?.statusMessage).toBe('Local data restore rejected')

      const restoreResult = await requestJson<{ restoredStores: unknown[], safetyBackupPath: string }>(
        server,
        '/api/admin/data-import/restore',
        {
          body: JSON.stringify({
            backup: exportResult.body,
            confirmPhrase: LOCAL_DATA_RESTORE_CONFIRMATION,
          }),
          method: 'POST',
        },
      )

      expect(restoreResult.response.status).toBe(200)
      expect(restoreResult.body?.restoredStores.length).toBeGreaterThan(0)
      expect(restoreResult.body?.safetyBackupPath).toContain(join('data', 'backups'))
      await expect(readFile(restoreResult.body!.safetyBackupPath, 'utf8')).resolves.toContain('"service": "Rybolov Cetín"')
    }
    finally {
      await server.close()
    }
  })

  it('previews and confirms safety backup cleanup through HTTP routes', async () => {
    const server = await startRouteServer()
    const backupDirectory = join(process.env.RYBOLOV_LOCAL_DATA_DIR!, 'backups')

    await writeSafetyBackupFixture(backupDirectory, '2026-06-04T08:00:00.000Z', 'reservation-1')
    await writeSafetyBackupFixture(backupDirectory, '2026-06-04T09:00:00.000Z', 'reservation-2')
    await writeSafetyBackupFixture(backupDirectory, '2026-06-04T10:00:00.000Z', 'reservation-3')
    await writeSafetyBackupFixture(backupDirectory, '2026-06-04T11:00:00.000Z', 'reservation-4')

    try {
      const dryRun = await requestJson<LocalDataSafetyBackupCleanupResponse>(
        server,
        '/api/admin/data-backups/cleanup',
        {
          body: JSON.stringify({
            dryRun: true,
            keepRecent: 2,
          }),
          method: 'POST',
        },
      )

      expect(dryRun.response.status).toBe(200)
      expect(dryRun.body?.cleanup.removableBackups.map((backup) => backup.fileName)).toEqual([
        'restore-safety-2026-06-04T09-00-00.json',
        'restore-safety-2026-06-04T08-00-00.json',
      ])

      const rejectedCleanup = await requestJson<{ statusCode: number, statusMessage: string }>(
        server,
        '/api/admin/data-backups/cleanup',
        {
          body: JSON.stringify({
            confirmPhrase: 'ZMAZAT',
            dryRun: false,
            keepRecent: 2,
          }),
          method: 'POST',
        },
      )

      expect(rejectedCleanup.response.status).toBe(422)
      expect(rejectedCleanup.body?.statusMessage).toBe('Safety backup cleanup confirmation failed')

      const cleanup = await requestJson<LocalDataSafetyBackupCleanupResponse>(
        server,
        '/api/admin/data-backups/cleanup',
        {
          body: JSON.stringify({
            confirmPhrase: LOCAL_DATA_BACKUP_CLEANUP_CONFIRMATION,
            dryRun: false,
            keepRecent: 2,
          }),
          method: 'POST',
        },
      )

      expect(cleanup.response.status).toBe(200)
      expect(cleanup.body?.cleanup.removedBackups?.map((backup) => backup.fileName)).toEqual([
        'restore-safety-2026-06-04T09-00-00.json',
        'restore-safety-2026-06-04T08-00-00.json',
      ])
      expect(cleanup.body?.cleanup.removableBackups).toEqual([])

      const archive = await requestJson<LocalDataSafetyBackupArchiveResponse>(server, '/api/admin/data-backups')

      expect(archive.body?.backups.map((backup) => backup.fileName)).toEqual([
        'restore-safety-2026-06-04T11-00-00.json',
        'restore-safety-2026-06-04T10-00-00.json',
      ])

      const audit = await readLocalAuditLogState()
      expect(audit.events[0]).toMatchObject({
        action: 'system.data_backup.cleanup',
        details: {
          keepRecent: 2,
          removedCount: 2,
        },
      })
    }
    finally {
      await server.close()
    }
  })
})
