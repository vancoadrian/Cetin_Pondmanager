import { createError, getCookie, type H3Event } from 'h3'
import { AUTH_SESSION_COOKIE } from '~/composables/useMockAuth'
import {
  ANGLER_SESSION_COOKIE,
  findMockAnglerAccountById,
  type MockAnglerAccount,
} from '~/services/anglerAccountService'
import { resolveLocalSession } from './localSessionStore'
import {
  applyLocalProfileToAnglerAccount,
  toRegisteredAnglerAccount,
} from './accountAuthentication'
import {
  findLocalAccountProfileOverride,
  findLocalRegisteredAccountById,
  isLocalAccountDeleted,
} from './localAccountStore'

export async function resolveMockAnglerAccount(event: H3Event): Promise<MockAnglerAccount | undefined> {
  const token = getCookie(event, ANGLER_SESSION_COOKIE) ?? getCookie(event, AUTH_SESSION_COOKIE)
  const session = await resolveLocalSession(token)
  if (!session || session.role !== 'angler') return undefined
  const sessionAccountId = session.accountId

  let account: MockAnglerAccount | undefined = findMockAnglerAccountById(sessionAccountId)
  const profile = await findLocalAccountProfileOverride(sessionAccountId)
  if (!account) {
    const registeredAccount = await findLocalRegisteredAccountById(sessionAccountId)
    account = registeredAccount ? toRegisteredAnglerAccount(registeredAccount, profile) : undefined
  }
  else {
    account = applyLocalProfileToAnglerAccount(account, profile)
  }

  if (!account || await isLocalAccountDeleted(account.id)) return undefined
  return account
}

export async function requireMockAnglerAccount(event: H3Event): Promise<MockAnglerAccount> {
  const account = await resolveMockAnglerAccount(event)
  if (account) return account

  throw createError({
    statusCode: 401,
    statusMessage: 'Angler login required',
  })
}
