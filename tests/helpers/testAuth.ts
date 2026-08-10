import type { MockRole } from '~/composables/useMockAuth'
import { createPasswordHash } from '~/server/utils/accountAuthentication'
import { updateLocalAccountPassword } from '~/server/utils/localAccountStore'
import { createLocalSession } from '~/server/utils/localSessionStore'

/**
 * Tests used to fake a login by setting the session cookie's value directly
 * to a role name or account id (e.g. `rybolov_cetin_mock_session=manager`).
 * That was the exact shape of the P0 session-forgery bug this store now
 * closes, so tests must go through a real, server-issued session token too.
 */
export async function createSessionCookieHeader(accountId: string, role: MockRole) {
  const { token } = await createLocalSession(accountId, role)
  return `rybolov_cetin_mock_session=${token}`
}

export async function createAnglerSessionCookieHeader(accountId: string) {
  const { token } = await createLocalSession(accountId, 'angler')
  return `rybolov_cetin_mock_angler_session=${token}`
}

/**
 * Seed accounts no longer share one password (see
 * scripts/generate-seed-credentials.ts). Tests that exercise the real
 * /api/auth/login contract must provision their own known credential
 * override first, exactly like the production bootstrap script does.
 */
export async function seedCredentialOverride(accountId: string, password: string) {
  await updateLocalAccountPassword(accountId, await createPasswordHash(password))
}
