import { defineEventHandler } from 'h3'
import { findMockUserById, type PublicMockUser } from '~/composables/useMockAuth'
import { findLocalAccountProfileOverride } from '../../utils/localAccountStore'
import { resolveAppSessionIdentity } from '../../utils/authSessionTokens'
import { persistRefreshedAuthTokens } from '../../utils/appSession'
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
  const session = await resolveAppSessionIdentity(event)
  if (!session) return { user: null }
  persistRefreshedAuthTokens(event, session.role)

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
