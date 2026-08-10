import { deleteCookie, getCookie, setCookie, type H3Event } from 'h3'
import {
  AUTH_SESSION_COOKIE,
  findMockUserById,
  type MockRole,
  type PublicMockUser,
} from '~/composables/useMockAuth'
import { ANGLER_SESSION_COOKIE } from '~/services/anglerAccountService'
import { resolveLocalSession } from './localSessionStore'

/** Legacy cookie name, no longer written; cleared defensively on every auth response. */
const LEGACY_AUTH_USER_COOKIE = 'rybolov_cetin_mock_user'

const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 14

function sessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.RYBOLOV_ENVIRONMENT === 'production',
  }
}

/**
 * Resolves the mock user tied to the current session cookie. The cookie only
 * carries an opaque, server-issued token now (see localSessionStore.ts) — its
 * value can no longer be forged into an arbitrary account id or role name.
 */
export function resolveAppSessionUser(event: H3Event): PublicMockUser | undefined {
  const session = resolveLocalSession(getCookie(event, AUTH_SESSION_COOKIE))
  return session ? findMockUserById(session.accountId) : undefined
}

export function applySessionCookies(event: H3Event, token: string, role: MockRole) {
  const options = sessionCookieOptions()
  setCookie(event, AUTH_SESSION_COOKIE, token, options)

  if (role === 'angler') {
    setCookie(event, ANGLER_SESSION_COOKIE, token, options)
  }
  else {
    deleteCookie(event, ANGLER_SESSION_COOKIE, { path: '/' })
  }

  deleteCookie(event, LEGACY_AUTH_USER_COOKIE, { path: '/' })
}

export function clearSessionCookies(event: H3Event) {
  deleteCookie(event, AUTH_SESSION_COOKIE, { path: '/' })
  deleteCookie(event, ANGLER_SESSION_COOKIE, { path: '/' })
  deleteCookie(event, LEGACY_AUTH_USER_COOKIE, { path: '/' })
}
