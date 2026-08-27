import { createClient, type User } from '@supabase/supabase-js'
import type { AuthSessionTokens } from './authSessionTokens'
import {
  requireSupabaseRuntimeCredentials,
  resolveRuntimeStorageDriverKind,
} from './runtimeStorageDriver'
import { getServerSupabaseClient } from './serverSupabaseClient'

/**
 * Supabase Auth (GoTrue) ako autorita pre identity a heslá — fáza 1–2 plánu
 * v docs/features/supabase-auth-migration.md. Session vrstva zostáva vlastná
 * (app_sessions); GoTrue tu slúži na overenie a uloženie prihlasovacích
 * údajov. Vo file driveri (explicitný dev/test adaptér) sa GoTrue nepoužíva
 * vôbec — legacy scrypt cesta zostáva jediná, aby unit testy ostali hermetické.
 */

export interface AuthIdentityDescriptor {
  /** Aplikačné id účtu (napr. `owner`, `angler-<uuid>`) — ukladá sa do app_metadata. */
  accountId: string
  /** Kanonický e-mail účtu (nie alias, ktorý používateľ napísal do formulára). */
  email: string
  role: string
}

export function isSupabaseAuthEnabled() {
  return resolveRuntimeStorageDriverKind() === 'supabase'
}

/**
 * Kill-switch legacy cesty pre produkciu po deprecačnom okne:
 * `RYBOLOV_AUTH_LEGACY_FALLBACK=disabled` vypne scrypt fallback, lazy
 * migráciu hesiel aj dual-read starých `app_sessions` tokenov. Vo file
 * driveri sa flag ignoruje — legacy je tam jediná cesta. Nevypínať skôr,
 * než sa reálni používatelia stihnú prihlásiť (lazy migrácia je jediný
 * spôsob, ako sa ich heslá dostanú do GoTrue).
 */
export function isLegacyAuthFallbackEnabled() {
  if (!isSupabaseAuthEnabled()) return true
  return process.env.RYBOLOV_AUTH_LEGACY_FALLBACK?.trim().toLowerCase() !== 'disabled'
}

function normalizeEmail(email: string) {
  return email.trim().toLocaleLowerCase('sk')
}

const AUTH_USERS_PAGE_SIZE = 1000
const AUTH_USERS_MAX_PAGES = 10

/**
 * GoTrue admin API nemá lookup podľa e-mailu, preto stránkujeme zoznam.
 * Revír má rádovo stovky účtov, takže prvá stránka pokryje bežný stav;
 * limit stránok je poistka proti nekonečnému cyklu.
 */
export async function findAuthUserByEmail(email: string): Promise<User | undefined> {
  const wanted = normalizeEmail(email)
  const admin = getServerSupabaseClient().auth.admin

  for (let page = 1; page <= AUTH_USERS_MAX_PAGES; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage: AUTH_USERS_PAGE_SIZE })
    if (error) throw new Error(`Supabase Auth listUsers zlyhalo: ${error.message}`)

    const match = data.users.find((user) => normalizeEmail(user.email ?? '') === wanted)
    if (match) return match
    if (data.users.length < AUTH_USERS_PAGE_SIZE) return undefined
  }

  return undefined
}

/**
 * Prihlási sa do GoTrue a vráti session tokeny (fáza 2b). `undefined` znamená
 * iba neplatné prihlasovacie údaje (vrátane neexistujúceho účtu); ostatné
 * chyby (nedostupný stack a pod.) prehadzuje, aby volajúci vedel spadnúť
 * späť na legacy overenie.
 */
export async function signInForAuthTokens(
  email: string,
  password: string,
): Promise<AuthSessionTokens | undefined> {
  const credentials = requireSupabaseRuntimeCredentials()
  const client = createClient(credentials.url, credentials.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await client.auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  })

  if (data.session?.access_token && data.session.refresh_token) {
    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    }
  }
  if (error && error.code === 'invalid_credentials') return undefined
  if (error && error.status === 400) return undefined

  throw new Error(`Supabase Auth overenie zlyhalo: ${error?.message ?? 'neznáma chyba'}`)
}

/** Overenie hesla proti GoTrue bez záujmu o session tokeny. */
export async function verifyAuthUserPassword(email: string, password: string): Promise<boolean> {
  return Boolean(await signInForAuthTokens(email, password))
}

/** Založí alebo aktualizuje GoTrue účet a nastaví mu heslo. */
export async function ensureAuthUserWithPassword(
  descriptor: AuthIdentityDescriptor,
  password: string,
): Promise<void> {
  const admin = getServerSupabaseClient().auth.admin
  const email = normalizeEmail(descriptor.email)
  const appMetadata = {
    app_account_id: descriptor.accountId,
    app_role: descriptor.role,
  }

  const existing = await findAuthUserByEmail(email)
  if (existing) {
    const { error } = await admin.updateUserById(existing.id, {
      app_metadata: appMetadata,
      password,
    })
    if (error) throw new Error(`Supabase Auth update účtu zlyhal: ${error.message}`)
    return
  }

  const { error } = await admin.createUser({
    app_metadata: appMetadata,
    email,
    email_confirm: true,
    password,
  })
  if (error) throw new Error(`Supabase Auth založenie účtu zlyhalo: ${error.message}`)
}

/** Založí nový GoTrue účet; e-mailový duplikát hlási cez `duplicate: true`. */
export async function createAuthUserWithPassword(
  descriptor: AuthIdentityDescriptor,
  password: string,
): Promise<{ duplicate: boolean }> {
  const admin = getServerSupabaseClient().auth.admin
  const { error } = await admin.createUser({
    app_metadata: {
      app_account_id: descriptor.accountId,
      app_role: descriptor.role,
    },
    email: normalizeEmail(descriptor.email),
    email_confirm: true,
    password,
  })

  if (!error) return { duplicate: false }
  if (error.code === 'email_exists' || error.status === 422) return { duplicate: true }
  throw new Error(`Supabase Auth založenie účtu zlyhalo: ${error.message}`)
}

/** Odstráni GoTrue účet (napr. pri zmazaní aplikačného účtu). Chýbajúci účet je no-op. */
export async function deleteAuthUserByEmail(email: string): Promise<void> {
  const existing = await findAuthUserByEmail(email)
  if (!existing) return

  const { error } = await getServerSupabaseClient().auth.admin.deleteUser(existing.id)
  if (error) throw new Error(`Supabase Auth zmazanie účtu zlyhalo: ${error.message}`)
}

/**
 * Jednotné overenie hesla: GoTrue má prednosť, legacy scrypt slúži ako
 * fallback a prvé úspešné legacy prihlásenie heslo lazy zmigruje do GoTrue
 * (bez dopadu na používateľa). Vo file driveri beží iba legacy cesta.
 */
export async function verifyPasswordForSessionWithAuthMigration(
  descriptor: AuthIdentityDescriptor,
  password: string,
  verifyLegacyPassword: () => Promise<boolean>,
): Promise<{ ok: boolean, tokens?: AuthSessionTokens }> {
  if (!isSupabaseAuthEnabled()) {
    return { ok: await verifyLegacyPassword() }
  }

  let tokens: AuthSessionTokens | undefined
  try {
    tokens = await signInForAuthTokens(descriptor.email, password)
    if (tokens) return { ok: true, tokens }
  }
  catch (error) {
    if (!isLegacyAuthFallbackEnabled()) throw error
    console.warn(`Supabase Auth nedostupné, používam legacy overenie: ${(error as Error).message}`)
    return { ok: await verifyLegacyPassword() }
  }

  if (!isLegacyAuthFallbackEnabled()) return { ok: false }
  if (!(await verifyLegacyPassword())) return { ok: false }

  try {
    await ensureAuthUserWithPassword(descriptor, password)
    tokens = await signInForAuthTokens(descriptor.email, password)
  }
  catch (error) {
    console.warn(`Lazy migrácia hesla do Supabase Auth zlyhala: ${(error as Error).message}`)
  }

  return { ok: true, tokens }
}

export async function verifyPasswordWithAuthMigration(
  descriptor: AuthIdentityDescriptor,
  password: string,
  verifyLegacyPassword: () => Promise<boolean>,
): Promise<boolean> {
  const { ok } = await verifyPasswordForSessionWithAuthMigration(descriptor, password, verifyLegacyPassword)
  return ok
}
