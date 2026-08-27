import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createAuthUserWithPassword,
  deleteAuthUserByEmail,
  signInForAuthTokens,
} from '../../server/utils/supabaseAuthIdentity'
import {
  looksLikeAuthJwt,
  refreshAuthSessionTokens,
  verifyAuthAccessToken,
} from '../../server/utils/authSessionTokens'
import { getServerSupabaseClient } from '../../server/utils/serverSupabaseClient'

/**
 * Fáza 2b: GoTrue JWT session tokeny proti živému lokálnemu stacku —
 * vydanie, lokálne overenie claims, rotácia refresh tokenu a správanie
 * po admin zmene hesla (revokácia refresh rodiny).
 */

const EMAIL = `session-tokens-${randomUUID()}@example.test`
const PASSWORD = 'SessionTest2026!x'
const ACCOUNT_ID = `angler-${randomUUID()}`

beforeAll(async () => {
  const { duplicate } = await createAuthUserWithPassword(
    { accountId: ACCOUNT_ID, email: EMAIL, role: 'angler' },
    PASSWORD,
  )
  expect(duplicate).toBe(false)
})

afterAll(async () => {
  await deleteAuthUserByEmail(EMAIL)
})

describe('vydanie a overenie tokenov', () => {
  it('signIn vráti JWT access + refresh token a claims nesú identitu', async () => {
    const tokens = await signInForAuthTokens(EMAIL, PASSWORD)
    expect(tokens).toBeDefined()
    expect(looksLikeAuthJwt(tokens!.accessToken)).toBe(true)
    expect(looksLikeAuthJwt(tokens!.refreshToken)).toBe(false)

    const verdict = await verifyAuthAccessToken(tokens!.accessToken)
    expect(verdict.status).toBe('valid')
    if (verdict.status === 'valid') {
      expect(verdict.identity.accountId).toBe(ACCOUNT_ID)
      expect(verdict.identity.role).toBe('angler')
      expect(verdict.identity.source).toBe('auth')
    }
  })

  it('nezmyselný token je invalid, nie expired', async () => {
    expect((await verifyAuthAccessToken('abc.def.ghi')).status).toBe('invalid')
  })

  it('zlé heslo nevydá tokeny', async () => {
    expect(await signInForAuthTokens(EMAIL, 'uplne-zle-heslo')).toBeUndefined()
  })
})

describe('refresh rotácia', () => {
  it('refresh vymení tokeny a nový access je platný', async () => {
    const tokens = await signInForAuthTokens(EMAIL, PASSWORD)
    const refreshed = await refreshAuthSessionTokens(tokens!.refreshToken)

    expect(refreshed).toBeDefined()
    expect(refreshed!.accessToken).not.toBe(tokens!.accessToken)

    const verdict = await verifyAuthAccessToken(refreshed!.accessToken)
    expect(verdict.status).toBe('valid')
  })

  it('paralelné refreshe s tým istým tokenom sa deduplikujú na jeden výsledok', async () => {
    const tokens = await signInForAuthTokens(EMAIL, PASSWORD)
    const [first, second] = await Promise.all([
      refreshAuthSessionTokens(tokens!.refreshToken),
      refreshAuthSessionTokens(tokens!.refreshToken),
    ])

    expect(first).toBeDefined()
    expect(second).toBeDefined()
    expect(first!.refreshToken).toBe(second!.refreshToken)
  })
})

describe('revokácia po zmene hesla', () => {
  it('admin zmena hesla zneplatní starý refresh token', async () => {
    const tokens = await signInForAuthTokens(EMAIL, PASSWORD)
    expect(tokens).toBeDefined()

    const admin = getServerSupabaseClient().auth.admin
    const { data } = await admin.listUsers({ page: 1, perPage: 1000 })
    const user = data.users.find((candidate) => candidate.email === EMAIL)
    expect(user).toBeDefined()

    const { error } = await admin.updateUserById(user!.id, { password: `${PASSWORD}-new` })
    expect(error).toBeNull()

    // GoTrue pri zmene hesla revokuje refresh rodiny — session na iných
    // zariadeniach zomrie najneskôr po expirácii access tokenu (~1 h).
    const refreshed = await refreshAuthSessionTokens(tokens!.refreshToken)
    expect(refreshed).toBeUndefined()

    // vráť pôvodné heslo pre ostatné testy
    const { error: restoreError } = await admin.updateUserById(user!.id, { password: PASSWORD })
    expect(restoreError).toBeNull()
  })
})
