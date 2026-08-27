import { createError, type H3Event } from 'h3'
import {
  findMockAnglerAccountById,
  type MockAnglerAccount,
} from '~/services/anglerAccountService'
import { resolveAppSessionIdentity } from './authSessionTokens'
import { persistRefreshedAuthTokens } from './appSession'
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
  const identity = await resolveAppSessionIdentity(event)
  if (!identity || identity.role !== 'angler') return undefined
  persistRefreshedAuthTokens(event, identity.role)
  const sessionAccountId = identity.accountId

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
