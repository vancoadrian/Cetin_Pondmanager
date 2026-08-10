import { useAuthUserState } from '~/composables/useMockAuth'
import type { PublicMockUser } from '~/composables/useMockAuth'

/**
 * Resolves the current session server-side (via the httpOnly session cookie)
 * before the app mounts, so route middleware and pages always see a
 * trustworthy identity instead of a client-forgeable cookie value.
 */
export default defineNuxtPlugin({
  name: 'auth-session',
  async setup() {
    const sessionUser = useAuthUserState()
    // Widened to `string` on purpose: with 100+ typed API routes, letting
    // Nitro's typed-fetch overload resolution match this literal route (or
    // unify the useRequestFetch()/$fetch function types in one variable)
    // blows TypeScript's comparison stack depth (TS2321).
    const sessionEndpoint: string = '/api/auth/session'

    try {
      const result = import.meta.server
        ? await useRequestFetch()<{ user: PublicMockUser | null }>(sessionEndpoint)
        : await $fetch<{ user: PublicMockUser | null }>(sessionEndpoint)
      sessionUser.value = result.user
    }
    catch {
      sessionUser.value = null
    }
  },
})
