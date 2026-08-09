import { defineEventHandler, getCookie } from 'h3'
import { AUTH_SESSION_COOKIE, findMockUserById, type PublicMockUser } from '~/composables/useMockAuth'
import { findLocalAccountProfileOverride } from '../../utils/localAccountStore'
import { resolveLocalSession } from '../../utils/localSessionStore'
import { resolveMockAnglerAccount } from '../../utils/anglerSession'

export interface AuthSessionResponse {
  user: PublicMockUser | null
}

/**
 * Resolves the current identity purely from the server-verified session
 * cookie. The client never reads or trusts the cookie value itself — it only
 * ever learns "who is logged in" through this endpoint's response.
 */
export default defineEventHandler(async (event): Promise<AuthSessionResponse> => {
  const session = resolveLocalSession(getCookie(event, AUTH_SESSION_COOKIE))
  if (!session) return { user: null }

  if (session.role !== 'angler') {
    return { user: findMockUserById(session.accountId) ?? null }
  }

  const anglerAccount = await resolveMockAnglerAccount(event)
  if (!anglerAccount) return { user: null }

  const seedMockUser = findMockUserById(session.accountId)
  const profile = await findLocalAccountProfileOverride(session.accountId)

  if (seedMockUser) {
    return {
      user: {
        ...seedMockUser,
        name: profile?.name ?? seedMockUser.name,
        phone: profile?.phone,
      },
    }
  }

  return {
    user: {
      description: 'Osobný účet pre rezervácie, výpravy, zápisníky a históriu úlovkov.',
      email: anglerAccount.email,
      id: anglerAccount.id,
      name: anglerAccount.name,
      permissions: ['moje výpravy', 'zápisníky', 'úlovky'],
      phone: anglerAccount.phone,
      role: 'angler',
      roleLabel: 'rybár',
    },
  }
})
