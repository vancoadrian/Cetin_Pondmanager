import { resolveDeploymentEnvironment } from '~/services/environmentReadinessService'

export type RuntimeStorageDriverKind = 'file' | 'supabase'

/**
 * Single source of truth for which persistence driver the server runtime
 * uses. Supabase (Postgres + Storage) is the production driver; the local
 * filesystem driver exists only as an explicit development/test adapter and
 * must never be silently selected as a fallback.
 */
export function resolveRuntimeStorageDriverKind(
  env: Record<string, string | undefined> = process.env,
): RuntimeStorageDriverKind {
  const explicit = env.RYBOLOV_STORAGE_DRIVER?.trim().toLowerCase()
  const environment = resolveDeploymentEnvironment(env)

  if (explicit === 'file') {
    if (environment === 'production') {
      throw new Error(
        'RYBOLOV_STORAGE_DRIVER=file je povolené iba pre development a testy. '
        + 'Produkčný beh vyžaduje Supabase driver (NUXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY).',
      )
    }

    return 'file'
  }

  if (explicit && explicit !== 'supabase') {
    throw new Error(
      `Neznáma hodnota RYBOLOV_STORAGE_DRIVER="${explicit}". Podporované sú "supabase" a "file".`,
    )
  }

  return 'supabase'
}

export interface SupabaseRuntimeCredentials {
  secretKey: string
  url: string
}

/**
 * Server-only Supabase credentials. The secret/service-role key must never
 * leave the server: it is read from private env vars and is intentionally
 * not part of runtimeConfig.public.
 */
export function resolveSupabaseRuntimeCredentials(
  env: Record<string, string | undefined> = process.env,
): SupabaseRuntimeCredentials | undefined {
  const url = env.NUXT_PUBLIC_SUPABASE_URL?.trim()
  const secretKey = env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !secretKey) return undefined

  return { secretKey, url }
}

export function requireSupabaseRuntimeCredentials(
  env: Record<string, string | undefined> = process.env,
): SupabaseRuntimeCredentials {
  const credentials = resolveSupabaseRuntimeCredentials(env)

  if (!credentials) {
    throw new Error(
      'Supabase driver nemá kompletné prístupy: nastav NUXT_PUBLIC_SUPABASE_URL a SUPABASE_SECRET_KEY '
      + '(lokálne cez `pnpm supabase:start` + `pnpm local:setup`), alebo pre testy explicitne RYBOLOV_STORAGE_DRIVER=file.',
    )
  }

  return credentials
}
