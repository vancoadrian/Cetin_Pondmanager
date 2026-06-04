import { describe, expect, it } from 'vitest'
import {
  adminModules,
  canAccessAdminPath,
  findAdminModuleByPath,
  getAdminModuleAccess,
  getAdminModulesForRole,
  canManageAdminModule,
  canOperateAdminModule,
  hasAdminAccessMode,
} from '~/app/utils/adminAccess'

describe('admin access matrix', () => {
  it('gives the owner every admin module', () => {
    expect(getAdminModulesForRole('owner')).toHaveLength(adminModules.length)
    expect(canAccessAdminPath('owner', '/admin/sponzori')).toBe(true)
    expect(canAccessAdminPath('owner', '/admin/mapa')).toBe(true)
  })

  it('limits accountant to finance and reporting oriented modules', () => {
    const modules = getAdminModulesForRole('accountant').map((module) => module.id)

    expect(modules).toEqual(['dashboard', 'reservations', 'catches', 'rentals', 'tournaments', 'sponsors', 'system', 'audit'])
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

  it('distinguishes read, operate and full write levels', () => {
    expect(hasAdminAccessMode('read', 'operate')).toBe(false)
    expect(hasAdminAccessMode('operate', 'operate')).toBe(true)
    expect(hasAdminAccessMode('full', 'operate')).toBe(true)
    expect(canOperateAdminModule('worker', 'reservations')).toBe(true)
    expect(canManageAdminModule('worker', 'reservations')).toBe(false)
    expect(canManageAdminModule('manager', 'map')).toBe(true)
    expect(canManageAdminModule('owner', 'catches')).toBe(true)
    expect(canOperateAdminModule('accountant', 'catches')).toBe(false)
    expect(canOperateAdminModule('organizer', 'notifications')).toBe(true)
    expect(canManageAdminModule('organizer', 'notifications')).toBe(false)
    expect(canOperateAdminModule('accountant', 'sponsors')).toBe(false)
    expect(canOperateAdminModule('accountant', 'system')).toBe(false)
    expect(canOperateAdminModule('worker', 'rentals')).toBe(true)
    expect(canManageAdminModule('worker', 'closures')).toBe(false)
  })
})
