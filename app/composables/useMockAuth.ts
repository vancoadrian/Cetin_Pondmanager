import { findMockAnglerAccountByEmail } from '~/services/anglerAccountService'

export const AUTH_SESSION_COOKIE = 'rybolov_cetin_mock_session'

export type MockRole =
  | 'angler'
  | 'owner'
  | 'manager'
  | 'organizer'
  | 'marshal'
  | 'team'
  | 'accountant'
  | 'worker'

export interface MockUser {
  email: string
  id: string
  marshalId?: string
  name: string
  role: MockRole
  roleLabel: string
  sectorId?: string
  tournamentId?: string
  description: string
  permissions: string[]
  phone?: string
}

/**
 * Credentials never live in this module: it is bundled to the client (it is a
 * composable), so any password field here would ship in the client JS. Every
 * seed account's password is a unique, randomly generated value whose scrypt
 * hash lives server-only in the local account store's credentialOverrides
 * (see scripts/generate-seed-credentials.ts and server/utils/accountAuthentication.ts).
 */
export type PublicMockUser = MockUser

export interface MockLoginResult {
  message?: string
  ok: boolean
}

export interface MockRegistrationResponse {
  ok: true
  user: PublicMockUser
}

export const mockUsers: MockUser[] = [
  {
    email: 'marek.horvath@example.test',
    id: 'angler-marek',
    name: 'Marek H.',
    role: 'angler',
    roleLabel: 'rybár',
    description: 'Má prístup k vlastným zápisníkom, výpravám a histórii úlovkov.',
    permissions: ['moje výpravy', 'zápisníky', 'úlovky'],
  },
  {
    email: 'majitel@rybolovcetin.sk',
    id: 'owner',
    name: 'Majiteľ revíru',
    role: 'owner',
    roleLabel: 'majiteľ',
    description: 'Vidí celé stredisko, financie, nastavenia, sponzorov a všetky interné moduly.',
    permissions: ['nastavenia revíru', 'uzávierky', 'rezervácie', 'sponzori', 'reporting'],
  },
  {
    email: 'spravca@rybolovcetin.sk',
    id: 'manager',
    name: 'Správca pri vode',
    role: 'manager',
    roleLabel: 'správca',
    description: 'Rieši rezervácie, obsadenosť, požičovňu, výstrahy a denné prevádzkové zmeny.',
    permissions: ['rezervácie', 'požičovňa', 'výstrahy', 'kontakt s rybármi'],
  },
  {
    email: 'kontrolor@rybolovcetin.sk',
    id: 'marshal',
    name: 'Kontrolór súťaže',
    role: 'marshal',
    roleLabel: 'kontrolór',
    marshalId: 'marshal-1',
    tournamentId: 'eccj-2026',
    description: 'Má pridelené sektory, overuje úlovky, rieši hlásenia a zapisuje tresty.',
    permissions: ['súťažné sektory', 'váženie', 'kontroly pravidiel', 'tresty'],
  },
  {
    email: 'organizator@rybolovcetin.sk',
    id: 'organizer',
    name: 'Organizátor súťaže',
    role: 'organizer',
    roleLabel: 'organizátor',
    description: 'Spravuje súťaž, sektory, tímy, pravidlá, priebeh pretekov a výstupy pre verejnosť.',
    permissions: ['súťaž', 'sektory', 'tímy', 'pravidlá', 'výsledkovka'],
  },
  {
    email: 'tim@rybolovcetin.sk',
    id: 'team',
    name: 'Súťažný tím',
    role: 'team',
    roleLabel: 'tím',
    sectorId: 'a1',
    tournamentId: 'eccj-2026',
    description: 'Vidí vlastný sektor, vie privolať kontrolóra a nahlásiť udalosť počas pretekov.',
    permissions: ['vlastný sektor', 'privolanie kontrolóra', 'námietky', 'história úlovkov'],
  },
  {
    email: 'uctovnik@rybolovcetin.sk',
    id: 'accountant',
    name: 'Účtovník',
    role: 'accountant',
    roleLabel: 'účtovník',
    description: 'Vidí platby, rezervácie, exporty a podklady bez prevádzkových zásahov do mapy.',
    permissions: ['platby', 'rezervácie', 'exporty', 'podklady'],
  },
  {
    email: 'brigadnik@rybolovcetin.sk',
    id: 'worker',
    name: 'Brigádnik',
    role: 'worker',
    roleLabel: 'brigádnik',
    description: 'Pomáha pri nástupe hostí, výbave, údržbe a praktických úlohách pri vode.',
    permissions: ['nástupy', 'požičovňa', 'údržba', 'prevádzkové úlohy'],
  },
]

export function getAuthenticatedHome(role?: MockRole | null) {
  if (role === 'angler') return '/konto'
  if (role === 'team') return '/sutaze/tim'
  if (role === 'marshal') return '/admin/sutaze/kontrolor'
  if (role === 'organizer') return '/admin/sutaze'
  if (role === 'accountant') return '/admin/rezervacie'
  if (role === 'worker') return '/admin/hlasenia'
  if (role) return '/admin'

  return '/'
}

export function isSafeAppRedirect(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
}

export function findMockUserByEmail(email: string) {
  const normalizedEmail = email.trim().toLocaleLowerCase('sk')
  const directMatch = mockUsers.find((item) => item.email.toLocaleLowerCase('sk') === normalizedEmail)
  const aliasAccount = directMatch ? undefined : findMockAnglerAccountByEmail(normalizedEmail)

  return directMatch ?? (aliasAccount
    ? mockUsers.find((item) => item.role === 'angler' && item.id === aliasAccount.id)
    : undefined)
}

export function findMockUserById(userId?: string | null) {
  return mockUsers.find((item) => item.id === userId)
}

export function canUseTournamentTeamScope(
  user: PublicMockUser | null | undefined,
  tournamentId: unknown,
  sectorId: unknown,
) {
  return user?.role === 'team'
    && typeof tournamentId === 'string'
    && typeof sectorId === 'string'
    && user.tournamentId === tournamentId
    && user.sectorId === sectorId
}

/**
 * Authoritative client-side cache of "who is logged in". It is populated by
 * app/plugins/auth-session.ts from GET /api/auth/session (which resolves the
 * httpOnly session cookie server-side) and updated in place by login/register/
 * logout. The cookie itself is httpOnly and opaque, so it is never read or
 * trusted on the client — the server is the only party that can mint or
 * verify a session (see server/utils/localSessionStore.ts).
 */
export function useAuthUserState() {
  return useState<PublicMockUser | null>('rybolov-auth-user', () => null)
}

export function useMockAuth() {
  const sessionUser = useAuthUserState()

  const user = computed(() => sessionUser.value)
  const isLoggedIn = computed(() => user.value !== null)

  function applyAuthenticatedUser(authenticatedUser: PublicMockUser) {
    sessionUser.value = authenticatedUser
  }

  function updateAuthenticatedProfile(profile: { id: string, name: string, phone?: string }) {
    if (!user.value || user.value.id !== profile.id || user.value.role !== 'angler') return

    sessionUser.value = {
      ...user.value,
      name: profile.name,
      phone: profile.phone,
    }
  }

  function getAuthErrorMessage(error: unknown, fallback: string) {
    const fetchError = error as {
      data?: {
        data?: { messages?: string[] }
        message?: string
        statusMessage?: string
      }
    }

    return fetchError.data?.data?.messages?.join(' ')
      || fetchError.data?.message
      || fetchError.data?.statusMessage
      || fallback
  }

  async function login(email: string, password: string): Promise<MockLoginResult> {
    try {
      const result = await $fetch<{ ok: true, user: PublicMockUser }>('/api/auth/login', {
        body: { email, password },
        method: 'POST',
      })

      applyAuthenticatedUser(result.user)
      return { ok: true }
    }
    catch (error) {
      return {
        message: getAuthErrorMessage(error, 'Prihlásenie sa nepodarilo.'),
        ok: false,
      }
    }
  }

  async function register(name: string, email: string, password: string): Promise<MockLoginResult> {
    try {
      const result = await $fetch<MockRegistrationResponse>('/api/auth/register', {
        body: { email, name, password },
        method: 'POST',
      })

      applyAuthenticatedUser(result.user)
      return { ok: true }
    }
    catch (error) {
      return {
        message: getAuthErrorMessage(error, 'Účet sa nepodarilo vytvoriť.'),
        ok: false,
      }
    }
  }

  async function logout() {
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
    }
    catch {
      // Best-effort: clear local state regardless of network failure.
    }
    sessionUser.value = null

    if (import.meta.client && 'caches' in window) {
      void caches.keys().then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) =>
            cacheName.startsWith('rybolov-pages') || cacheName.startsWith('rybolov-public-api'),
          )
          .map((cacheName) => caches.delete(cacheName)),
      )).catch(() => undefined)
    }
  }

  return {
    isLoggedIn,
    login,
    logout,
    register,
    updateAuthenticatedProfile,
    user,
  }
}
