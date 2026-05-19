export type MockRole = 'owner' | 'manager' | 'organizer' | 'marshal' | 'team' | 'accountant' | 'worker'

export interface MockUser {
  id: string
  name: string
  role: MockRole
  roleLabel: string
  description: string
  permissions: string[]
}

export const mockUsers: MockUser[] = [
  {
    id: 'owner',
    name: 'Majiteľ revíru',
    role: 'owner',
    roleLabel: 'owner',
    description: 'Vidí celé stredisko, financie, nastavenia, sponzorov a všetky interné moduly.',
    permissions: ['nastavenia revíru', 'uzávierky', 'rezervácie', 'sponzori', 'reporting'],
  },
  {
    id: 'manager',
    name: 'Správca pri vode',
    role: 'manager',
    roleLabel: 'správca',
    description: 'Rieši rezervácie, obsadenosť, požičovňu, výstrahy a denné prevádzkové zmeny.',
    permissions: ['rezervácie', 'požičovňa', 'výstrahy', 'kontakt s rybármi'],
  },
  {
    id: 'marshal',
    name: 'Kontrolór súťaže',
    role: 'marshal',
    roleLabel: 'kontrolór',
    description: 'Má pridelené sektory, overuje úlovky, rieši hlásenia a zapisuje tresty.',
    permissions: ['súťažné sektory', 'váženie', 'kontroly pravidiel', 'tresty'],
  },
  {
    id: 'organizer',
    name: 'Organizátor súťaže',
    role: 'organizer',
    roleLabel: 'organizátor',
    description: 'Spravuje súťaž, sektory, tímy, pravidlá, priebeh pretekov a výstupy pre verejnosť.',
    permissions: ['súťaž', 'sektory', 'tímy', 'pravidlá', 'výsledkovka'],
  },
  {
    id: 'team',
    name: 'Súťažný tím',
    role: 'team',
    roleLabel: 'tím',
    description: 'Vidí vlastný sektor, vie privolať kontrolóra a nahlásiť udalosť počas pretekov.',
    permissions: ['vlastný sektor', 'privolanie kontrolóra', 'námietky', 'história úlovkov'],
  },
  {
    id: 'accountant',
    name: 'Účtovník',
    role: 'accountant',
    roleLabel: 'účtovník',
    description: 'Vidí platby, rezervácie, exporty a podklady bez prevádzkových zásahov do mapy.',
    permissions: ['platby', 'rezervácie', 'exporty', 'podklady'],
  },
  {
    id: 'worker',
    name: 'Brigádnik',
    role: 'worker',
    roleLabel: 'brigádnik',
    description: 'Pomáha pri nástupe hostí, výbave, údržbe a praktických úlohách pri vode.',
    permissions: ['nástupy', 'požičovňa', 'údržba', 'prevádzkové úlohy'],
  },
]

export function useMockAuth() {
  const session = useCookie<string | null>('rybolov_cetin_mock_session', {
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 14,
  })

  const user = computed(() => mockUsers.find((item) => item.id === session.value) ?? null)
  const isLoggedIn = computed(() => user.value !== null)

  function login(userId: string) {
    session.value = userId
  }

  function logout() {
    session.value = null
  }

  return {
    isLoggedIn,
    login,
    logout,
    mockUsers,
    user,
  }
}
