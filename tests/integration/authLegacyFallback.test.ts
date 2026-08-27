import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { afterEach, describe, expect, it } from 'vitest'
import {
  deleteAuthUserByEmail,
  verifyPasswordForSessionWithAuthMigration,
} from '../../server/utils/supabaseAuthIdentity'
import { resolveAppSessionIdentity } from '../../server/utils/authSessionTokens'

/**
 * Kill-switch `RYBOLOV_AUTH_LEGACY_FALLBACK=disabled` pre produkciu po
 * deprecačnom okne: scrypt fallback, lazy migrácia aj dual-read starých
 * session tokenov sa dajú vypnúť jednou env premennou.
 */

const EMAIL = `legacy-fallback-${randomUUID()}@example.test`
const ACCOUNT_ID = `angler-${randomUUID()}`

function fakeEvent(cookieHeader: string): H3Event {
  return {
    context: {},
    node: { req: { headers: { cookie: cookieHeader } } },
  } as unknown as H3Event
}

afterEach(async () => {
  delete process.env.RYBOLOV_AUTH_LEGACY_FALLBACK
  await deleteAuthUserByEmail(EMAIL)
})

describe('RYBOLOV_AUTH_LEGACY_FALLBACK=disabled', () => {
  it('platné legacy heslo už neprihlási a nespustí lazy migráciu', async () => {
    process.env.RYBOLOV_AUTH_LEGACY_FALLBACK = 'disabled'

    const { ok, tokens } = await verifyPasswordForSessionWithAuthMigration(
      { accountId: ACCOUNT_ID, email: EMAIL, role: 'angler' },
      'LegacyHeslo2026!x',
      async () => true,
    )

    expect(ok).toBe(false)
    expect(tokens).toBeUndefined()
  })

  it('so zapnutým fallbackom to isté heslo prihlási a zmigruje', async () => {
    const { ok, tokens } = await verifyPasswordForSessionWithAuthMigration(
      { accountId: ACCOUNT_ID, email: EMAIL, role: 'angler' },
      'LegacyHeslo2026!x',
      async () => true,
    )

    expect(ok).toBe(true)
    expect(tokens).toBeDefined()
  })

  it('legacy session token sa pri vypnutom fallbacku neakceptuje', async () => {
    process.env.RYBOLOV_AUTH_LEGACY_FALLBACK = 'disabled'

    const identity = await resolveAppSessionIdentity(
      fakeEvent('rybolov_cetin_mock_session=nejaky-legacy-opaque-token'),
    )

    expect(identity).toBeUndefined()
  })
})
