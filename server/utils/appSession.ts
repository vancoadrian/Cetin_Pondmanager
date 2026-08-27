import { deleteCookie, setCookie, type H3Event } from 'h3'
import {
  AUTH_SESSION_COOKIE,
  findMockUserById,
  type MockRole,
  type PublicMockUser,
} from '~/composables/useMockAuth'
import { ANGLER_SESSION_COOKIE } from '~/services/anglerAccountService'
import {
  AUTH_REFRESH_COOKIE,
  consumeRefreshedAuthTokens,
  resolveAppSessionIdentity,
  type AuthSessionTokens,
} from './authSessionTokens'

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

interface AppSessionEventContext {
  __appSessionUser?: PublicMockUser | null
}

/**
 * Resolves the mock user tied to the current session cookie. The cookie only
 * carries an opaque, server-issued token now (see localSessionStore.ts) — its
 * value can no longer be forged into an arbitrary account id or role name.
 * The lookup hits the session store once per request and is memoized on the
 * event context.
 */
export async function resolveAppSessionUser(event: H3Event): Promise<PublicMockUser | undefined> {
  const context = event.context as AppSessionEventContext
  if (context.__appSessionUser !== undefined) return context.__appSessionUser ?? undefined

  const identity = await resolveAppSessionIdentity(event)
  const user = identity ? findMockUserById(identity.accountId) : undefined
  context.__appSessionUser = user ?? null

  if (identity) persistRefreshedAuthTokens(event, identity.role)

  return user
}

/**
 * Tichý refresh počas čítania identity vymení GoTrue tokeny — nové cookies
 * treba zapísať do odpovede, inak by ďalší request išiel s mŕtvym refresh
 * tokenom (rotácia je single-use).
 */
export function persistRefreshedAuthTokens(event: H3Event, role: MockRole) {
  const tokens = consumeRefreshedAuthTokens(event)
  if (tokens) applyAuthSessionCookies(event, tokens, role)
}

/** GoTrue JWT session (fáza 2b): access token v hlavnej cookie, refresh vedľa. */
export function applyAuthSessionCookies(event: H3Event, tokens: AuthSessionTokens, role: MockRole) {
  const options = sessionCookieOptions()
  setCookie(event, AUTH_SESSION_COOKIE, tokens.accessToken, options)
  setCookie(event, AUTH_REFRESH_COOKIE, tokens.refreshToken, options)

  if (role === 'angler') {
    setCookie(event, ANGLER_SESSION_COOKIE, tokens.accessToken, options)
  }
  else {
    deleteCookie(event, ANGLER_SESSION_COOKIE, { path: '/' })
  }

  deleteCookie(event, LEGACY_AUTH_USER_COOKIE, { path: '/' })
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
  deleteCookie(event, AUTH_REFRESH_COOKIE, { path: '/' })
  deleteCookie(event, ANGLER_SESSION_COOKIE, { path: '/' })
  deleteCookie(event, LEGACY_AUTH_USER_COOKIE, { path: '/' })
}
