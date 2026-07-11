import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, createRouter, toNodeListener } from 'h3'
import type { PublicMockUser } from '~/app/composables/useMockAuth'
import type { AccountDeletionResponse } from '~/app/services/accountDeletionService'
import type { AnglerAccountDataExport } from '~/app/services/anglerAccountDataService'
import accountDeleteHandler from '~/server/api/account/delete.post'
import accountExportHandler from '~/server/api/account/export.get'
import accountLogbooksHandler from '~/server/api/account/logbooks.get'
import loginHandler from '~/server/api/auth/login.post'
import { readLocalAccountState } from '~/server/utils/localAccountStore'
import { readLocalAuditLogState } from '~/server/utils/localAuditLogStore'
import { readLocalCatchState } from '~/server/utils/localCatchStore'
import { readLocalReservationState } from '~/server/utils/localReservationStore'

const MAREK_COOKIE = 'rybolov_cetin_mock_session=angler-marek'
const localEnvKeys = [
  'RYBOLOV_LOCAL_ACCOUNT_STORE',
  'RYBOLOV_LOCAL_AUDIT_LOG_STORE',
  'RYBOLOV_LOCAL_CATCH_STORE',
  'RYBOLOV_LOCAL_RESERVATION_STORE',
] as const
const originalEnv = new Map<string, string | undefined>()
let tempDir: string | undefined

interface TestRouteServer {
  baseUrl: string
  close: () => Promise<void>
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'rybolov-account-routes-'))
  for (const key of localEnvKeys) {
    if (!originalEnv.has(key)) originalEnv.set(key, process.env[key])
  }

  const dataDir = join(tempDir, 'data')
  process.env.RYBOLOV_LOCAL_ACCOUNT_STORE = join(dataDir, 'account-state.json')
  process.env.RYBOLOV_LOCAL_AUDIT_LOG_STORE = join(dataDir, 'audit-log.json')
  process.env.RYBOLOV_LOCAL_CATCH_STORE = join(dataDir, 'catch-state.json')
  process.env.RYBOLOV_LOCAL_RESERVATION_STORE = join(dataDir, 'reservation-state.json')
})

afterEach(async () => {
  for (const key of localEnvKeys) {
    const original = originalEnv.get(key)
    if (original === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = original
  }
  if (tempDir) await rm(tempDir, { force: true, recursive: true })
  tempDir = undefined
})

function createRouteApp() {
  const app = createApp()
  const router = createRouter()
  router.post('/api/auth/login', loginHandler)
  router.post('/api/account/delete', accountDeleteHandler)
  router.get('/api/account/export', accountExportHandler)
  router.get('/api/account/logbooks', accountLogbooksHandler)
  app.use(router.handler)
  return app
}

async function startRouteServer(): Promise<TestRouteServer> {
  const server = createServer(toNodeListener(createRouteApp()))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Testovací server nemá port.')

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    }),
  }
}

async function requestJson<T>(
  server: TestRouteServer,
  path: string,
  options: { body?: unknown, cookie?: string, method?: string } = {},
) {
  const headers = new Headers({ accept: 'application/json' })
  if (options.body !== undefined) headers.set('content-type', 'application/json')
  if (options.cookie) headers.set('cookie', options.cookie)
  const response = await fetch(`${server.baseUrl}${path}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers,
    method: options.method ?? 'GET',
  })
  const raw = await response.text()
  return {
    body: raw ? JSON.parse(raw) as T : null,
    response,
  }
}

describe('account deletion routes', () => {
  it('authenticates active accounts through the server login contract', async () => {
    const server = await startRouteServer()
    try {
      const result = await requestJson<{ ok: true, user: PublicMockUser }>(server, '/api/auth/login', {
        body: { email: 'marek.h@example.com', password: 'Cetin2026!' },
        method: 'POST',
      })
      expect(result.response.status).toBe(200)
      expect(result.body.user).toMatchObject({ id: 'angler-marek', role: 'angler' })
      expect(result.body.user).not.toHaveProperty('password')
    }
    finally {
      await server.close()
    }
  })

  it('requires an authenticated angler and the current password', async () => {
    const server = await startRouteServer()
    try {
      const anonymous = await requestJson<{ statusMessage: string }>(server, '/api/account/delete', {
        body: { confirmation: 'ZMAZAŤ', password: 'Cetin2026!' },
        method: 'POST',
      })
      expect(anonymous.response.status).toBe(401)

      const wrongPassword = await requestJson<{ statusMessage: string }>(server, '/api/account/delete', {
        body: { confirmation: 'ZMAZAŤ', password: 'nesprávne' },
        cookie: MAREK_COOKIE,
        method: 'POST',
      })
      expect(wrongPassword.response.status).toBe(422)
      expect(wrongPassword.body.statusMessage).toBe('Aktuálne heslo nie je správne.')
    }
    finally {
      await server.close()
    }
  })

  it('downloads only the signed-in angler data with private response headers', async () => {
    const server = await startRouteServer()
    try {
      const anonymous = await requestJson<{ statusMessage: string }>(server, '/api/account/export')
      expect(anonymous.response.status).toBe(401)

      const result = await requestJson<AnglerAccountDataExport>(server, '/api/account/export', {
        cookie: MAREK_COOKIE,
      })
      expect(result.response.status).toBe(200)
      expect(result.response.headers.get('cache-control')).toBe('private, no-store')
      expect(result.response.headers.get('content-disposition')).toMatch(/attachment; filename="rybolov-cetin-moje-udaje-/)
      expect(result.body.account).toMatchObject({ id: 'angler-marek', name: 'Marek H.' })
      expect(result.body.reservations[0]).not.toHaveProperty('internalNote')
      expect(JSON.stringify(result.body)).not.toContain('Tomáš K.')

      const auditState = await readLocalAuditLogState()
      expect(auditState.events).toContainEqual(expect.objectContaining({ action: 'account.data_export.downloaded' }))
    }
    finally {
      await server.close()
    }
  })

  it('deletes login access and anonymizes linked operational data', async () => {
    const server = await startRouteServer()
    try {
      const deleted = await requestJson<AccountDeletionResponse>(server, '/api/account/delete', {
        body: { confirmation: 'ZMAZAŤ', password: 'Cetin2026!' },
        cookie: MAREK_COOKIE,
        method: 'POST',
      })
      expect(deleted.response.status).toBe(200)
      expect(deleted.body.summary).toEqual({ catches: 1, logbookEntries: 1, logbooks: 1, reservations: 1 })
      expect(deleted.response.headers.get('set-cookie')).toContain('rybolov_cetin_mock_session=')

      const accountState = await readLocalAccountState()
      const reservationState = await readLocalReservationState()
      const catchState = await readLocalCatchState()
      const auditState = await readLocalAuditLogState()
      expect(accountState.deletions).toContainEqual(expect.objectContaining({ accountId: 'angler-marek' }))
      expect(reservationState.reservations.find((item) => item.id === 'r-1001')).toMatchObject({
        contactPhone: '',
        guest: 'Anonymný rybár',
      })
      expect(catchState.tripLogbooks.find((item) => item.id === 'logbook-cabin-3-may')?.ownerUserId).toBeUndefined()
      expect(auditState.events).toContainEqual(expect.objectContaining({ action: 'account.deleted' }))

      const loginAfterDeletion = await requestJson<{ statusMessage: string }>(server, '/api/auth/login', {
        body: { email: 'marek.horvath@example.test', password: 'Cetin2026!' },
        method: 'POST',
      })
      expect(loginAfterDeletion.response.status).toBe(403)

      const staleSession = await requestJson<{ statusMessage: string }>(server, '/api/account/logbooks', {
        cookie: MAREK_COOKIE,
      })
      expect(staleSession.response.status).toBe(401)
    }
    finally {
      await server.close()
    }
  })
})
