import type { MockRole } from '~/composables/useMockAuth'

export type AdminAccessMode = 'full' | 'operate' | 'read'

export type AdminModuleId =
  | 'dashboard'
  | 'reservations'
  | 'catches'
  | 'fish'
  | 'issues'
  | 'closures'
  | 'map'
  | 'rentals'
  | 'tournaments'
  | 'notifications'
  | 'sponsors'
  | 'system'
  | 'audit'

export interface AdminModuleDefinition {
  id: AdminModuleId
  label: string
  to: string
  icon: string
  description: string
  access: Partial<Record<MockRole, AdminAccessMode>>
}

export const adminAccessModeLabels: Record<AdminAccessMode, string> = {
  full: 'plný',
  operate: 'prevádzka',
  read: 'prehľad',
}

export const adminAccessModeDescriptions: Record<AdminAccessMode, string> = {
  full: 'Môže spravovať a meniť údaje v module.',
  operate: 'Môže riešiť pridelené prevádzkové úlohy.',
  read: 'Má prehľad bez plného prevádzkového rozhodovania.',
}

const accessRank: Record<AdminAccessMode, number> = {
  read: 1,
  operate: 2,
  full: 3,
}

const mockAdminRoles = [
  'owner',
  'manager',
  'organizer',
  'marshal',
  'accountant',
  'worker',
] as const satisfies readonly MockRole[]

export interface AdminApiAccessRequirement {
  mode?: AdminAccessMode
  moduleId: AdminModuleId
}

export interface AdminApiAccessDecision {
  allowed: boolean
  currentMode?: AdminAccessMode
  moduleId: AdminModuleId
  moduleLabel: string
  requiredMode: AdminAccessMode
  role?: MockRole
  statusCode?: 401 | 403
  statusMessage?: string
}

export const adminModules: AdminModuleDefinition[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    to: '/admin',
    icon: 'i-heroicons-squares-2x2',
    description: 'Súhrn internej prevádzky podľa aktuálnej role.',
    access: {
      owner: 'full',
      manager: 'full',
    },
  },
  {
    id: 'reservations',
    label: 'Rezervácie',
    to: '/admin/rezervacie',
    icon: 'i-heroicons-calendar-days',
    description: 'Schvaľovanie žiadostí, kalendár miest, chaty a doplnky.',
    access: {
      owner: 'full',
      manager: 'full',
      accountant: 'read',
      worker: 'operate',
    },
  },
  {
    id: 'catches',
    label: 'Úlovky',
    to: '/admin/ulovky',
    icon: 'i-heroicons-camera',
    description: 'Schvaľovanie verejných úlovkov, korekcie a reporty dát.',
    access: {
      owner: 'full',
      manager: 'full',
      accountant: 'read',
    },
  },
  {
    id: 'fish',
    label: 'Čipované ryby',
    to: '/admin/ryby',
    icon: 'i-heroicons-tag',
    description: 'Register čipov, opakované merania, história rastu a CSV import.',
    access: {
      owner: 'full',
      manager: 'full',
    },
  },
  {
    id: 'issues',
    label: 'Hlásenia',
    to: '/admin/hlasenia',
    icon: 'i-heroicons-wrench-screwdriver',
    description: 'Nedostatky na miestach, chatách a servisných bodoch.',
    access: {
      owner: 'full',
      manager: 'full',
      worker: 'operate',
    },
  },
  {
    id: 'closures',
    label: 'Uzávierky',
    to: '/admin/uzavierky',
    icon: 'i-heroicons-no-symbol',
    description: 'Sezóny, neres, údržba, súťaže a mimoriadne blokácie.',
    access: {
      owner: 'full',
      manager: 'full',
    },
  },
  {
    id: 'map',
    label: 'Mapa',
    to: '/admin/mapa',
    icon: 'i-heroicons-map-pin',
    description: 'SVG editor lovných miest, chát a súťažných vrstiev.',
    access: {
      owner: 'full',
      manager: 'full',
      organizer: 'read',
      worker: 'read',
    },
  },
  {
    id: 'rentals',
    label: 'Požičovňa',
    to: '/admin/pozicovna',
    icon: 'i-heroicons-archive-box',
    description: 'Sklad výbavy, dostupnosť a priradenie k rezerváciám.',
    access: {
      owner: 'full',
      manager: 'full',
      worker: 'operate',
      accountant: 'read',
    },
  },
  {
    id: 'tournaments',
    label: 'Súťaže',
    to: '/admin/sutaze',
    icon: 'i-heroicons-trophy',
    description: 'Dispečing hlásení, kontrolóri, váženia, tresty a výsledky.',
    access: {
      owner: 'full',
      manager: 'full',
      organizer: 'full',
      marshal: 'operate',
      accountant: 'read',
    },
  },
  {
    id: 'notifications',
    label: 'Notifikácie',
    to: '/admin/notifikacie',
    icon: 'i-heroicons-bell-alert',
    description: 'Výstrahy, servisné oznamy a budúce push broadcasty.',
    access: {
      owner: 'full',
      manager: 'full',
      organizer: 'operate',
    },
  },
  {
    id: 'sponsors',
    label: 'Sponzori',
    to: '/admin/sponzori',
    icon: 'i-heroicons-star',
    description: 'Partneri revíru, súťaží a sektorových umiestnení.',
    access: {
      owner: 'full',
      manager: 'operate',
      organizer: 'operate',
      accountant: 'read',
    },
  },
  {
    id: 'system',
    label: 'Systém',
    to: '/admin/system',
    icon: 'i-heroicons-heart',
    description: 'Health checky, lokálny error reporting a produkčná pripravenosť.',
    access: {
      owner: 'full',
      manager: 'read',
    },
  },
  {
    id: 'audit',
    label: 'Audit',
    to: '/admin/audit',
    icon: 'i-heroicons-clipboard-document-list',
    description: 'Stopa interných rozhodnutí a citlivých zmien.',
    access: {
      owner: 'full',
      manager: 'read',
    },
  },
]

export function getAdminModulesForRole(role?: MockRole | null) {
  if (!role) return []

  return adminModules.filter((module) => module.access[role])
}

export function getAdminNavigationItemsForRole(role?: MockRole | null): AdminModuleDefinition[] {
  return getAdminModulesForRole(role).map((module) => {
    if (role === 'marshal' && module.id === 'tournaments') {
      return {
        ...module,
        description: 'Pridelené sektory, váženia, kontroly pravidiel a tresty.',
        label: 'Moja súťaž',
        to: '/admin/sutaze/kontrolor',
      }
    }

    return module
  })
}

export function getAdminModuleAccess(module: AdminModuleDefinition, role?: MockRole | null) {
  if (!role) return undefined

  return module.access[role]
}

export function findAdminModuleById(moduleId: AdminModuleId) {
  return adminModules.find((module) => module.id === moduleId)
}

export function hasAdminAccessMode(mode: AdminAccessMode | undefined, required: AdminAccessMode) {
  if (!mode) return false

  return accessRank[mode] >= accessRank[required]
}

export function canOperateAdminModule(role: MockRole | undefined | null, moduleId: AdminModuleId) {
  const module = findAdminModuleById(moduleId)
  if (!module) return false

  return hasAdminAccessMode(getAdminModuleAccess(module, role), 'operate')
}

export function canManageAdminModule(role: MockRole | undefined | null, moduleId: AdminModuleId) {
  const module = findAdminModuleById(moduleId)
  if (!module) return false

  return hasAdminAccessMode(getAdminModuleAccess(module, role), 'full')
}

export function findAdminModuleByPath(path: string) {
  const normalizedPath = path.replace(/\/$/, '') || '/admin'

  return [...adminModules]
    .sort((first, second) => second.to.length - first.to.length)
    .find((module) => {
      if (module.to === '/admin') return normalizedPath === '/admin'

      return normalizedPath === module.to || normalizedPath.startsWith(`${module.to}/`)
    })
}

export function canAccessAdminPath(role: MockRole | undefined | null, path: string) {
  const module = findAdminModuleByPath(path)
  if (!module) return false

  if (role === 'marshal') {
    const marshalWorkspace = '/admin/sutaze/kontrolor'
    const normalizedPath = path.replace(/\/$/, '')

    return normalizedPath === marshalWorkspace || normalizedPath.startsWith(`${marshalWorkspace}/`)
  }

  return Boolean(getAdminModuleAccess(module, role))
}

export function isMockAdminRole(value: string | null | undefined): value is MockRole {
  return typeof value === 'string'
    && mockAdminRoles.includes(value as (typeof mockAdminRoles)[number])
}

export function getAdminApiAccessDecision(
  role: MockRole | undefined,
  requirement: AdminApiAccessRequirement,
): AdminApiAccessDecision {
  const requiredMode = requirement.mode ?? 'read'
  const module = findAdminModuleById(requirement.moduleId)
  const currentMode = module ? getAdminModuleAccess(module, role) : undefined

  if (module && hasAdminAccessMode(currentMode, requiredMode)) {
    return {
      allowed: true,
      currentMode,
      moduleId: requirement.moduleId,
      moduleLabel: module.label,
      requiredMode,
      role,
    }
  }

  return {
    allowed: false,
    currentMode,
    moduleId: requirement.moduleId,
    moduleLabel: module?.label ?? requirement.moduleId,
    requiredMode,
    role,
    statusCode: role ? 403 : 401,
    statusMessage: role ? 'Admin access denied' : 'Admin login required',
  }
}
