import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Real Supabase RLS assertions need a live local stack (`pnpm supabase:start`
 * then `pnpm supabase:reset` to apply migrations). These tests are opted out
 * of the default `pnpm test` run (see vitest.integration.config.ts /
 * `pnpm test:integration`) for exactly that reason — no Docker, no CI step
 * for it yet, matching how this repo's mock/local-store backend is still
 * the actual runtime today.
 */
export function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set. Run \`pnpm supabase:start\` and \`pnpm local:setup\` before \`pnpm test:integration\`.`,
    )
  }
  return value
}

export function createAnonClient(): SupabaseClient {
  return createClient(requiredEnv('NUXT_PUBLIC_SUPABASE_URL'), requiredEnv('NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function createServiceRoleClient(): SupabaseClient {
  return createClient(requiredEnv('NUXT_PUBLIC_SUPABASE_URL'), requiredEnv('SUPABASE_SECRET_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Signs up a throwaway auth user (email confirmation is disabled on the
 * local stack, see supabase/config.toml) and returns a client authenticated
 * as that user, so RLS policies relying on auth.uid() can be exercised.
 */
export async function createAuthenticatedClient(emailPrefix: string) {
  const client = createAnonClient()
  const email = `${emailPrefix}-${randomUUID()}@example.test`
  const password = `Test-${randomUUID()}`

  const { data, error } = await client.auth.signUp({ email, password })
  if (error || !data.user) {
    throw new Error(`Failed to sign up test user ${email}: ${error?.message}`)
  }

  return { client, userId: data.user.id }
}
