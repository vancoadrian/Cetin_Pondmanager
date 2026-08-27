import { createClient } from '@supabase/supabase-js'
import { getCookie, type H3Event } from 'h3'
import { createRemoteJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify, type JWTPayload } from 'jose'
import { AUTH_SESSION_COOKIE, type MockRole } from '~/composables/useMockAuth'
import { ANGLER_SESSION_COOKIE } from '~/services/anglerAccountService'
import { requireSupabaseRuntimeCredentials } from './runtimeStorageDriver'
import { getServerSupabaseClient } from './serverSupabaseClient'
import { resolveLocalSession } from './localSessionStore'

/**
 * Fáza 2b migrácie na Supabase Auth (docs/features/supabase-auth-migration.md):
 * session v Supabase driveri nesie GoTrue access token (JWT) + refresh token
 * v cookies namiesto vlastného tokenu v `app_sessions`. Identita sa číta
 * priamo z claims (`app_metadata.app_account_id` / `app_role` — zapisuje ich
 * výhradne server admin API), takže bežný request nepotrebuje ani jeden DB
 * dotaz. Staré opaque tokeny sa počas prechodného okna ďalej akceptujú
 * (dual-read) a file driver ostáva čisto na legacy ceste.
 */

export const AUTH_REFRESH_COOKIE = 'rybolov_cetin_auth_refresh'

export interface AuthSessionTokens {
  accessToken: string
  refreshToken: string
}

export interface AppSessionIdentity {
  accountId: string
  role: MockRole
  /** `auth` = GoTrue JWT, `legacy` = opaque token v app_sessions. */
  source: 'auth' | 'legacy'
}

interface RefreshedSessionEventContext {
  __refreshedAuthTokens?: AuthSessionTokens
}

/** Opaque legacy tokeny sú base64url bez bodiek; JWT má presne dve. */
export function looksLikeAuthJwt(token: string) {
  return token.split('.').length === 3
}

let cachedRemoteJwks: ReturnType<typeof createRemoteJWKSet> | undefined

function resolveJwksVerifier() {
  if (!cachedRemoteJwks) {
    const { url } = requireSupabaseRuntimeCredentials()
    cachedRemoteJwks = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`))
  }
  return cachedRemoteJwks
}

function identityFromClaims(payload: JWTPayload): AppSessionIdentity | undefined {
  const appMetadata = payload.app_metadata as { app_account_id?: unknown, app_role?: unknown } | undefined
  const accountId = appMetadata?.app_account_id
  const role = appMetadata?.app_role
  if (typeof accountId !== 'string' || typeof role !== 'string' || !accountId || !role) return undefined

  // app_metadata môže zapísať iba server cez admin API, claim je teda dôveryhodný
  return { accountId, role: role as MockRole, source: 'auth' }
}

type AccessTokenVerdict =
  | { identity: AppSessionIdentity, status: 'valid' }
  | { status: 'expired' }
  | { status: 'invalid' }

export async function verifyAuthAccessToken(token: string): Promise<AccessTokenVerdict> {
  try {
    // Nové Supabase stacky podpisujú asymetricky (ES256 + JWKS), legacy
    // projekty symetricky (HS256 + zdieľaný secret) — rozhoduje alg hlavičky.
    const { alg } = decodeProtectedHeader(token)
    const secret = process.env.SUPABASE_JWT_SECRET?.trim()

    const { payload } = alg?.startsWith('HS')
      ? await jwtVerify(token, new TextEncoder().encode(secret ?? ''))
      : await jwtVerify(token, resolveJwksVerifier())

    const identity = identityFromClaims(payload)
    return identity ? { identity, status: 'valid' } : { status: 'invalid' }
  }
  catch (error) {
    if ((error as { code?: string }).code === 'ERR_JWT_EXPIRED') return { status: 'expired' }
    return { status: 'invalid' }
  }
}

/**
 * Refresh tokeny sú single-use (rotácia) — paralelné requesty s tým istým
 * tokenom sa deduplikujú na jeden GoTrue roundtrip, nech si preteky
 * nezneplatnia session.
 */
const inflightRefreshes = new Map<string, Promise<AuthSessionTokens | undefined>>()

export async function refreshAuthSessionTokens(refreshToken: string): Promise<AuthSessionTokens | undefined> {
  const inflight = inflightRefreshes.get(refreshToken)
  if (inflight) return inflight

  const refreshPromise = (async () => {
    const credentials = requireSupabaseRuntimeCredentials()
    const client = createClient(credentials.url, credentials.secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken })
    if (error || !data.session?.access_token || !data.session.refresh_token) return undefined

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    }
  })()

  inflightRefreshes.set(refreshToken, refreshPromise)
  try {
    return await refreshPromise
  }
  finally {
    inflightRefreshes.delete(refreshToken)
  }
}

/**
 * Jednotné čítanie identity zo session cookies: GoTrue JWT (vrátane tichého
 * refreshu po expirácii) s fallbackom na legacy opaque token. Obnovené tokeny
 * si volajúci vyzdvihne cez `consumeRefreshedAuthTokens` a zapíše do cookies —
 * tento modul zámerne nič nezapisuje, aby čítanie ostalo bez vedľajších efektov.
 */
export async function resolveAppSessionIdentity(event: H3Event): Promise<AppSessionIdentity | undefined> {
  const token = getCookie(event, AUTH_SESSION_COOKIE) ?? getCookie(event, ANGLER_SESSION_COOKIE)
  if (!token) return undefined

  if (!looksLikeAuthJwt(token)) {
    const session = await resolveLocalSession(token)
    return session ? { accountId: session.accountId, role: session.role, source: 'legacy' } : undefined
  }

  const verdict = await verifyAuthAccessToken(token)
  if (verdict.status === 'valid') return verdict.identity
  if (verdict.status === 'invalid') return undefined

  const refreshToken = getCookie(event, AUTH_REFRESH_COOKIE)
  if (!refreshToken) return undefined

  const refreshed = await refreshAuthSessionTokens(refreshToken)
  if (!refreshed) return undefined

  const refreshedVerdict = await verifyAuthAccessToken(refreshed.accessToken)
  if (refreshedVerdict.status !== 'valid') return undefined

  ;(event.context as RefreshedSessionEventContext).__refreshedAuthTokens = refreshed
  return refreshedVerdict.identity
}

/** Tokeny obnovené počas `resolveAppSessionIdentity` — na zápis do cookies. */
export function consumeRefreshedAuthTokens(event: H3Event): AuthSessionTokens | undefined {
  const context = event.context as RefreshedSessionEventContext
  const tokens = context.__refreshedAuthTokens
  context.__refreshedAuthTokens = undefined
  return tokens
}

/** Best-effort revokácia GoTrue session pri odhlásení (refresh rodina). */
export async function revokeAuthSession(event: H3Event): Promise<void> {
  const token = getCookie(event, AUTH_SESSION_COOKIE) ?? getCookie(event, ANGLER_SESSION_COOKIE)
  if (!token || !looksLikeAuthJwt(token)) return

  try {
    // decodeJwt iba na kontrolu, že token má telo — revokáciu robí GoTrue
    decodeJwt(token)
    const { error } = await getServerSupabaseClient().auth.admin.signOut(token, 'local')
    if (error) console.warn(`GoTrue revokácia session zlyhala: ${error.message}`)
  }
  catch (error) {
    console.warn(`GoTrue revokácia session zlyhala: ${(error as Error).message}`)
  }
}
