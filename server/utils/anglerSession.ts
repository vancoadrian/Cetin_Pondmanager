import { createError, getCookie, type H3Event } from 'h3'
import {
  ANGLER_SESSION_COOKIE,
  findMockAnglerAccountById,
  type MockAnglerAccount,
} from '~/services/anglerAccountService'

export function resolveMockAnglerAccount(event: H3Event): MockAnglerAccount | undefined {
  return findMockAnglerAccountById(getCookie(event, ANGLER_SESSION_COOKIE))
}

export function requireMockAnglerAccount(event: H3Event): MockAnglerAccount {
  const account = resolveMockAnglerAccount(event)
  if (account) return account

  throw createError({
    statusCode: 401,
    statusMessage: 'Angler login required',
  })
}
