import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireSupabaseRuntimeCredentials } from './runtimeStorageDriver'

/**
 * Server-only Supabase client authenticated with the secret (service-role)
 * key. It bypasses RLS, so it must stay inside `server/` code paths and is
 * never serialized into any client payload. Client-side code keeps using the
 * publishable key through its own repositories once client RLS flows land.
 */
let cachedClient: SupabaseClient | undefined
let cachedClientKey: string | undefined

export function getServerSupabaseClient(): SupabaseClient {
  const credentials = requireSupabaseRuntimeCredentials()
  const cacheKey = `${credentials.url}::${credentials.secretKey}`

  if (!cachedClient || cachedClientKey !== cacheKey) {
    cachedClient = createClient(credentials.url, credentials.secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
    cachedClientKey = cacheKey
  }

  return cachedClient
}
