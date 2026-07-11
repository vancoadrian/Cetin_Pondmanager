import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, createRouter, toNodeListener } from 'h3'
import type { MockRegistrationResponse, PublicMockUser } from '~/app/composables/useMockAuth'
import type { AccountDeletionResponse } from '~/app/services/accountDeletionService'
import type { AccountProfileUpdateResponse } from '~/app/services/accountProfileService'
import type {
  PasswordResetConfirmResponse,
  PasswordResetRequestResponse,
} from '~/app/services/accountPasswordResetService'
import accountDeleteHandler from '~/server/api/account/delete.post'
import accountLogbooksHandler from '~/server/api/account/logbooks.get'
import accountProfileHandler from '~/server/api/account/profile.put'
import loginHandler from '~/server/api/auth/login.post'
import passwordResetConfirmHandler from '~/server/api/auth/password-reset/confirm.post'
import passwordResetRequestHandler from '~/server/api/auth/password-reset/request.post'
import registerHandler from '~/server/api/auth/register.post'
import { createPasswordResetToken } from '~/server/utils/accountPasswordReset'
import { readLocalAccountState, saveLocalPasswordReset } from '~/server/utils/localAccountStore'
import { readLocalAuditLogState } from '~/server/utils/localAuditLogStore'

const localEnvKeys = [
  'RYBOLOV_LOCAL_ACCOUNT_STORE',
  'RYBOLOV_LOCAL_AUDIT_LOG_STORE',
  'RYBOLOV_LOCAL_CATCH_STORE',
  'RYBOLOV_LOCAL_RESERVATION_STORE',
  'RYBOLOV_AUTH_DELIVERY_PROVIDER',
] as const
const originalEnv = new Map<string, string | undefined>()
let tempDir: string | undefined

interface TestRouteServer {
  baseUrl: string
  close: () => Promise<void>
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'rybolov-account-registration-'))
  for (const key of localEnvKeys) {
    if (!originalEnv.has(key)) originalEnv.set(key, process.env[key])
  }

  const dataDir = join(tempDir, 'data')
  process.env.RYBOLOV_LOCAL_ACCOUNT_STORE = join(dataDir, 'account-state.json')
  process.env.RYBOLOV_LOCAL_AUDIT_LOG_STORE = join(dataDir, 'audit-log.json')
  process.env.RYBOLOV_LOCAL_CATCH_STORE = join(dataDir, 'catch-state.json')
  process.env.RYBOLOV_LOCAL_RESERVATION_STORE = join(dataDir, 'reservation-state.json')
  process.env.RYBOLOV_AUTH_DELIVERY_PROVIDER = 'mock'
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
  router.post('/api/auth/password-reset/request', passwordResetRequestHandler)
  router.post('/api/auth/password-reset/confirm', passwordResetConfirmHandler)
  router.post('/api/account/delete', accountDeleteHandler)
  router.get('/api/account/logbooks', accountLogbooksHandler)
  router.put('/api/account/profile', accountProfileHandler)
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

const validRegistration = {
  email: '  NOVY.RYBAR@example.sk  ',
  name: '  Nový Rybár  ',
  password: 'Bezpecne2026',
}

describe('account registration routes', () => {
  it('creates a persistent angler with a password hash and allows login', async () => {
    const server = await startRouteServer()
    try {
      const registered = await requestJson<MockRegistrationResponse>(server, '/api/auth/register', {
        body: validRegistration,
        method: 'POST',
      })
      expect(registered.response.status).toBe(200)
      expect(registered.body.user).toMatchObject({
        email: 'novy.rybar@example.sk',
        name: 'Nový Rybár',
        role: 'angler',
      })
      expect(registered.body.user).not.toHaveProperty('password')

      const state = await readLocalAccountState()
      expect(state.registeredAccounts).toHaveLength(1)
      expect(state.registeredAccounts[0]?.passwordHash).toMatch(/^scrypt:/)
      expect(state.registeredAccounts[0]?.passwordHash).not.toContain(validRegistration.password)

      const auditState = await readLocalAuditLogState()
      expect(auditState.events).toContainEqual(expect.objectContaining({
        action: 'account.created',
        actorLabel: 'Rybársky účet',
      }))
      expect(JSON.stringify(auditState)).not.toContain('novy.rybar@example.sk')

      const login = await requestJson<{ ok: true, user: PublicMockUser }>(server, '/api/auth/login', {
        body: { email: 'NOVY.RYBAR@example.sk', password: validRegistration.password },
        method: 'POST',
      })
      expect(login.response.status).toBe(200)
      expect(login.body.user.id).toBe(registered.body.user.id)

      const accountData = await requestJson<{ tripLogbooks: unknown[] }>(server, '/api/account/logbooks', {
        cookie: `rybolov_cetin_mock_session=${registered.body.user.id}`,
      })
      expect(accountData.response.status).toBe(200)
      expect(accountData.body.tripLogbooks).toEqual([])
    }
    finally {
      await server.close()
    }
  })

  it('rejects weak passwords and duplicate static or registered emails', async () => {
    const server = await startRouteServer()
    try {
      const weak = await requestJson<{ data: { messages: string[] } }>(server, '/api/auth/register', {
        body: { ...validRegistration, password: 'slabe' },
        method: 'POST',
      })
      expect(weak.response.status).toBe(422)
      expect(weak.body.data.messages).toContain('Heslo musí mať aspoň 10 znakov.')

      const staticDuplicate = await requestJson<{ statusMessage: string }>(server, '/api/auth/register', {
        body: { ...validRegistration, email: 'marek.h@example.com' },
        method: 'POST',
      })
      expect(staticDuplicate.response.status).toBe(409)

      const first = await requestJson<MockRegistrationResponse>(server, '/api/auth/register', {
        body: validRegistration,
        method: 'POST',
      })
      expect(first.response.status).toBe(200)

      const duplicate = await requestJson<{ statusMessage: string }>(server, '/api/auth/register', {
        body: { ...validRegistration, email: 'novy.rybar@example.sk' },
        method: 'POST',
      })
      expect(duplicate.response.status).toBe(409)
    }
    finally {
      await server.close()
    }
  })

  it('removes registered credentials when the angler deletes the account', async () => {
    const server = await startRouteServer()
    try {
      const registered = await requestJson<MockRegistrationResponse>(server, '/api/auth/register', {
        body: validRegistration,
        method: 'POST',
      })
      const cookie = `rybolov_cetin_mock_session=${registered.body.user.id}`

      const deleted = await requestJson<AccountDeletionResponse>(server, '/api/account/delete', {
        body: { confirmation: 'ZMAZAŤ', password: validRegistration.password },
        cookie,
        method: 'POST',
      })
      expect(deleted.response.status).toBe(200)

      const state = await readLocalAccountState()
      expect(state.registeredAccounts).toEqual([])
      expect(state.deletions).toContainEqual(expect.objectContaining({ accountId: registered.body.user.id }))

      const login = await requestJson<{ statusMessage: string }>(server, '/api/auth/login', {
        body: { email: 'novy.rybar@example.sk', password: validRegistration.password },
        method: 'POST',
      })
      expect(login.response.status).toBe(401)
    }
    finally {
      await server.close()
    }
  })

  it('persists profile changes for a registered angler across login', async () => {
    const server = await startRouteServer()
    try {
      const registered = await requestJson<MockRegistrationResponse>(server, '/api/auth/register', {
        body: validRegistration,
        method: 'POST',
      })
      const cookie = `rybolov_cetin_mock_session=${registered.body.user.id}`

      const updated = await requestJson<AccountProfileUpdateResponse>(server, '/api/account/profile', {
        body: { name: 'Rybár Po Úprave', phone: '+421 911 222 333' },
        cookie,
        method: 'PUT',
      })
      expect(updated.response.status).toBe(200)

      const state = await readLocalAccountState()
      expect(state.profileOverrides).toContainEqual(expect.objectContaining({
        accountId: registered.body.user.id,
        previousNames: ['Nový Rybár'],
      }))

      const login = await requestJson<{ ok: true, user: PublicMockUser }>(server, '/api/auth/login', {
        body: { email: 'novy.rybar@example.sk', password: validRegistration.password },
        method: 'POST',
      })
      expect(login.body.user).toMatchObject({
        name: 'Rybár Po Úprave',
        phone: '+421 911 222 333',
      })
    }
    finally {
      await server.close()
    }
  })

  it('returns the same password reset response for known and unknown emails', async () => {
    const server = await startRouteServer()
    try {
      await requestJson<MockRegistrationResponse>(server, '/api/auth/register', {
        body: validRegistration,
        method: 'POST',
      })

      const known = await requestJson<PasswordResetRequestResponse>(server, '/api/auth/password-reset/request', {
        body: { email: 'novy.rybar@example.sk' },
        method: 'POST',
      })
      const unknown = await requestJson<PasswordResetRequestResponse>(server, '/api/auth/password-reset/request', {
        body: { email: 'neznamy@example.sk' },
        method: 'POST',
      })
      const seededAngler = await requestJson<PasswordResetRequestResponse>(server, '/api/auth/password-reset/request', {
        body: { email: 'marek.h@example.com' },
        method: 'POST',
      })
      const internalAccount = await requestJson<PasswordResetRequestResponse>(server, '/api/auth/password-reset/request', {
        body: { email: 'spravca@rybolovcetin.sk' },
        method: 'POST',
      })

      expect(known.response.status).toBe(200)
      expect(unknown.response.status).toBe(200)
      expect(known.body).toEqual(unknown.body)
      expect(seededAngler.body).toEqual(unknown.body)
      expect(internalAccount.body).toEqual(unknown.body)
      expect(known.body.message).toContain('Ak účet s týmto e-mailom existuje')

      const state = await readLocalAccountState()
      expect(state.passwordResets).toEqual([])
      const auditState = await readLocalAuditLogState()
      expect(auditState.events).toContainEqual(expect.objectContaining({
        action: 'account.password_reset.requested',
        details: expect.objectContaining({ deliveryProvider: 'mock', deliveryStatus: 'prepared' }),
      }))
      expect(auditState.events.filter((event) => event.action === 'account.password_reset.requested')).toHaveLength(2)
      expect(JSON.stringify(auditState)).not.toContain('novy.rybar@example.sk')
    }
    finally {
      await server.close()
    }
  })

  it('changes a registered password once and rejects token replay', async () => {
    const server = await startRouteServer()
    try {
      const registered = await requestJson<MockRegistrationResponse>(server, '/api/auth/register', {
        body: validRegistration,
        method: 'POST',
      })
      const token = createPasswordResetToken(registered.body.user.id, new Date('2026-07-11T08:00:00.000Z'), 10_000)
      await saveLocalPasswordReset(token.reset)

      const stateBefore = await readLocalAccountState()
      expect(stateBefore.passwordResets).toHaveLength(1)
      expect(JSON.stringify(stateBefore)).not.toContain(token.token)

      const completed = await requestJson<PasswordResetConfirmResponse>(server, '/api/auth/password-reset/confirm', {
        body: { password: 'NoveHeslo2026', token: token.token },
        method: 'POST',
      })
      expect(completed.response.status).toBe(200)

      const oldLogin = await requestJson<{ statusMessage: string }>(server, '/api/auth/login', {
        body: { email: 'novy.rybar@example.sk', password: validRegistration.password },
        method: 'POST',
      })
      expect(oldLogin.response.status).toBe(401)

      const newLogin = await requestJson<{ ok: true, user: PublicMockUser }>(server, '/api/auth/login', {
        body: { email: 'novy.rybar@example.sk', password: 'NoveHeslo2026' },
        method: 'POST',
      })
      expect(newLogin.response.status).toBe(200)

      const replay = await requestJson<{ statusMessage: string }>(server, '/api/auth/password-reset/confirm', {
        body: { password: 'DalsieHeslo2026', token: token.token },
        method: 'POST',
      })
      expect(replay.response.status).toBe(422)
      expect(replay.body.statusMessage).toContain('nie je platný alebo už vypršal')

      const stateAfter = await readLocalAccountState()
      expect(stateAfter.passwordResets).toEqual([])
      const auditState = await readLocalAuditLogState()
      expect(auditState.events).toContainEqual(expect.objectContaining({ action: 'account.password_reset.completed' }))
    }
    finally {
      await server.close()
    }
  })

  it('resets the password of the seeded angler through a hashed credential override', async () => {
    const server = await startRouteServer()
    try {
      const token = createPasswordResetToken('angler-marek', new Date('2026-07-11T08:00:00.000Z'), 10_000)
      await saveLocalPasswordReset(token.reset)

      const completed = await requestJson<PasswordResetConfirmResponse>(server, '/api/auth/password-reset/confirm', {
        body: { password: 'MarekNove2026', token: token.token },
        method: 'POST',
      })
      expect(completed.response.status).toBe(200)

      const state = await readLocalAccountState()
      expect(state.credentialOverrides).toHaveLength(1)
      expect(state.credentialOverrides[0]).toMatchObject({ accountId: 'angler-marek' })
      expect(state.credentialOverrides[0]?.passwordHash).toMatch(/^scrypt:/)
      expect(JSON.stringify(state)).not.toContain('MarekNove2026')

      const oldLogin = await requestJson<{ statusMessage: string }>(server, '/api/auth/login', {
        body: { email: 'marek.horvath@example.test', password: 'Cetin2026!' },
        method: 'POST',
      })
      expect(oldLogin.response.status).toBe(401)

      const newLogin = await requestJson<{ ok: true, user: PublicMockUser }>(server, '/api/auth/login', {
        body: { email: 'marek.h@example.com', password: 'MarekNove2026' },
        method: 'POST',
      })
      expect(newLogin.response.status).toBe(200)
      expect(newLogin.body.user.id).toBe('angler-marek')
    }
    finally {
      await server.close()
    }
  })
})
