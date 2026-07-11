import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, createRouter, toNodeListener } from 'h3'
import type { MockRegistrationResponse, PublicMockUser } from '~/app/composables/useMockAuth'
import type { AccountDeletionResponse } from '~/app/services/accountDeletionService'
import type { AccountPasswordChangeResponse } from '~/app/services/accountSecurityService'
import accountDeleteHandler from '~/server/api/account/delete.post'
import accountPasswordHandler from '~/server/api/account/password.post'
import loginHandler from '~/server/api/auth/login.post'
import registerHandler from '~/server/api/auth/register.post'
import { readLocalAccountState } from '~/server/utils/localAccountStore'
import { readLocalAuditLogState } from '~/server/utils/localAuditLogStore'

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
  tempDir = await mkdtemp(join(tmpdir(), 'rybolov-account-password-'))
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
  router.post('/api/auth/register', registerHandler)
  router.post('/api/auth/login', loginHandler)
  router.post('/api/account/password', accountPasswordHandler)
  router.post('/api/account/delete', accountDeleteHandler)
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

describe('account password change route', () => {
  it('requires an angler session and the correct current password', async () => {
    const server = await startRouteServer()
    try {
      const anonymous = await requestJson<{ statusMessage: string }>(server, '/api/account/password', {
        body: { currentPassword: 'Cetin2026!', password: 'MarekNove2026' },
        method: 'POST',
      })
      expect(anonymous.response.status).toBe(401)

      const incorrect = await requestJson<{ statusMessage: string }>(server, '/api/account/password', {
        body: { currentPassword: 'Nespravne2026', password: 'MarekNove2026' },
        cookie: MAREK_COOKIE,
        method: 'POST',
      })
      expect(incorrect.response.status).toBe(422)
      expect(incorrect.body.statusMessage).toBe('Aktuálne heslo nie je správne.')
    }
    finally {
      await server.close()
    }
  })

  it('changes a seeded angler password, clears sessions and removes the override on deletion', async () => {
    const server = await startRouteServer()
    try {
      const changed = await requestJson<AccountPasswordChangeResponse>(server, '/api/account/password', {
        body: { currentPassword: 'Cetin2026!', password: 'MarekNove2026' },
        cookie: MAREK_COOKIE,
        method: 'POST',
      })
      expect(changed.response.status).toBe(200)
      expect(changed.body.ok).toBe(true)
      const clearedCookies = changed.response.headers.get('set-cookie') ?? ''
      expect(clearedCookies).toContain('rybolov_cetin_mock_session=')
      expect(clearedCookies).toContain('rybolov_cetin_mock_user=')
      expect(clearedCookies).toContain('rybolov_cetin_mock_angler_session=')

      const stateAfterChange = await readLocalAccountState()
      expect(stateAfterChange.credentialOverrides).toHaveLength(1)
      expect(stateAfterChange.credentialOverrides[0]).toMatchObject({ accountId: 'angler-marek' })
      expect(stateAfterChange.credentialOverrides[0]?.passwordHash).toMatch(/^scrypt:/)
      expect(JSON.stringify(stateAfterChange)).not.toContain('MarekNove2026')

      const oldLogin = await requestJson<{ statusMessage: string }>(server, '/api/auth/login', {
        body: { email: 'marek.h@example.com', password: 'Cetin2026!' },
        method: 'POST',
      })
      expect(oldLogin.response.status).toBe(401)

      const newLogin = await requestJson<{ ok: true, user: PublicMockUser }>(server, '/api/auth/login', {
        body: { email: 'marek.h@example.com', password: 'MarekNove2026' },
        method: 'POST',
      })
      expect(newLogin.response.status).toBe(200)

      const audit = await readLocalAuditLogState()
      expect(audit.events).toContainEqual(expect.objectContaining({
        action: 'account.password_changed',
        actorLabel: 'Rybársky účet',
      }))
      expect(JSON.stringify(audit)).not.toContain('Cetin2026!')
      expect(JSON.stringify(audit)).not.toContain('MarekNove2026')

      const deleted = await requestJson<AccountDeletionResponse>(server, '/api/account/delete', {
        body: { confirmation: 'ZMAZAŤ', password: 'MarekNove2026' },
        cookie: MAREK_COOKIE,
        method: 'POST',
      })
      expect(deleted.response.status).toBe(200)
      expect((await readLocalAccountState()).credentialOverrides).toEqual([])
    }
    finally {
      await server.close()
    }
  })

  it('updates a registered account hash without creating a credential override', async () => {
    const server = await startRouteServer()
    try {
      const registration = {
        email: 'zmena.hesla@example.sk',
        name: 'Rybár Heslo',
        password: 'PovodneHeslo2026',
      }
      const registered = await requestJson<MockRegistrationResponse>(server, '/api/auth/register', {
        body: registration,
        method: 'POST',
      })
      expect(registered.response.status).toBe(200)
      const accountId = registered.body.user.id
      const originalHash = (await readLocalAccountState()).registeredAccounts[0]?.passwordHash

      const changed = await requestJson<AccountPasswordChangeResponse>(server, '/api/account/password', {
        body: { currentPassword: registration.password, password: 'NoveHeslo2026' },
        cookie: `rybolov_cetin_mock_session=${accountId}`,
        method: 'POST',
      })
      expect(changed.response.status).toBe(200)

      const state = await readLocalAccountState()
      expect(state.credentialOverrides).toEqual([])
      expect(state.registeredAccounts[0]?.passwordHash).toMatch(/^scrypt:/)
      expect(state.registeredAccounts[0]?.passwordHash).not.toBe(originalHash)

      const oldLogin = await requestJson<{ statusMessage: string }>(server, '/api/auth/login', {
        body: { email: registration.email, password: registration.password },
        method: 'POST',
      })
      expect(oldLogin.response.status).toBe(401)

      const newLogin = await requestJson<{ ok: true, user: PublicMockUser }>(server, '/api/auth/login', {
        body: { email: registration.email, password: 'NoveHeslo2026' },
        method: 'POST',
      })
      expect(newLogin.response.status).toBe(200)
      expect(newLogin.body.user.id).toBe(accountId)
    }
    finally {
      await server.close()
    }
  })
})
