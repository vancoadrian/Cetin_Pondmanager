import {
  requireSupabaseRuntimeCredentials,
  resolveRuntimeStorageDriverKind,
} from '../utils/runtimeStorageDriver'

/**
 * Fail-fast persistence guard. Resolving the driver validates the
 * RYBOLOV_STORAGE_DRIVER contract (the file adapter is dev/test-only and the
 * production run must never fall back to it silently); the Supabase driver
 * additionally requires complete server credentials before the first request
 * is served.
 */
export default defineNitroPlugin(() => {
  const driver = resolveRuntimeStorageDriverKind()

  if (driver === 'supabase') {
    requireSupabaseRuntimeCredentials()
  }

  console.info(`[rybolov-cetin] Runtime persistence driver: ${driver}`)
})
