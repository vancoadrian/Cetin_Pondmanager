import { describe, expect, it } from 'vitest'
import {
  adminModules,
  canAccessAdminPath,
  findAdminModuleByPath,
  getAdminModuleAccess,
  getAdminModulesForRole,
} from '~/app/utils/adminAccess'

describe('admin access matrix', () => {
  it('gives the owner every admin module', () => {
    expect(getAdminModulesForRole('owner')).toHaveLength(adminModules.length)
    expect(canAccessAdminPath('owner', '/admin/sponzori')).toBe(true)
    expect(canAccessAdminPath('owner', '/admin/mapa')).toBe(true)
  })

  it('limits accountant to finance and reporting oriented modules', () => {
    const modules = getAdminModulesForRole('accountant').map((module) => module.id)

    expect(modules).toEqual(['dashboard', 'reservations', 'catches', 'rentals', 'tournaments', 'sponsors', 'audit'])
    expect(canAccessAdminPath('accountant', '/admin/mapa')).toBe(false)
    expect(canAccessAdminPath('accountant', '/admin/rezervacie')).toBe(true)
  })

  it('keeps workers in operating modules without sponsor or audit access', () => {
    const modules = getAdminModulesForRole('worker').map((module) => module.id)

    expect(modules).toEqual(['dashboard', 'reservations', 'closures', 'map', 'rentals', 'tournaments'])
    expect(canAccessAdminPath('worker', '/admin/pozicovna')).toBe(true)
    expect(canAccessAdminPath('worker', '/admin/sponzori')).toBe(false)
  })

  it('matches nested admin routes to the owning module', () => {
    const module = findAdminModuleByPath('/admin/rezervacie/detail/test')

    expect(module?.id).toBe('reservations')
    expect(getAdminModuleAccess(module!, 'manager')).toBe('full')
    expect(canAccessAdminPath('team', '/admin/rezervacie/detail/test')).toBe(false)
  })
})
