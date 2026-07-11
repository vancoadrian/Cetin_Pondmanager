import { createError, getCookie, type H3Event } from 'h3'
import { AUTH_SESSION_COOKIE } from '~/composables/useMockAuth'
import {
  ANGLER_SESSION_COOKIE,
  findMockAnglerAccountById,
  type MockAnglerAccount,
} from '~/services/anglerAccountService'
import { resolveAppSessionUser } from './appSession'
import { toRegisteredAnglerAccount } from './accountAuthentication'
import {
  findLocalRegisteredAccountById,
  isLocalAccountDeleted,
} from './localAccountStore'

export async function resolveMockAnglerAccount(event: H3Event): Promise<MockAnglerAccount | undefined> {
  const user = resolveAppSessionUser(event)
  const sessionAccountId = user?.role === 'angler'
    ? user.id
    : getCookie(event, ANGLER_SESSION_COOKIE)
      ?? getCookie(event, AUTH_SESSION_COOKIE)
  let account: MockAnglerAccount | undefined
  if (sessionAccountId) {
    account = findMockAnglerAccountById(sessionAccountId)
    if (!account) {
      const registeredAccount = await findLocalRegisteredAccountById(sessionAccountId)
      account = registeredAccount ? toRegisteredAnglerAccount(registeredAccount) : undefined
    }
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
