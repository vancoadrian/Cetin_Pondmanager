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

    expect(modules).toEqual(['reservations', 'catches', 'rentals', 'tournaments', 'sponsors'])
    expect(canAccessAdminPath('accountant', '/admin/mapa')).toBe(false)
    expect(canAccessAdminPath('accountant', '/admin/rezervacie')).toBe(true)
    expect(canAccessAdminPath('accountant', '/admin/system')).toBe(false)
  })

  it('keeps workers in operating modules without sponsor or audit access', () => {
    const modules = getAdminModulesForRole('worker').map((module) => module.id)

    expect(modules).toEqual(['reservations', 'issues', 'map', 'rentals'])
    expect(canAccessAdminPath('worker', '/admin/hlasenia')).toBe(true)
    expect(canAccessAdminPath('worker', '/admin/pozicovna')).toBe(true)
    expect(canAccessAdminPath('worker', '/admin/sponzori')).toBe(false)
    expect(canAccessAdminPath('worker', '/admin/sutaze')).toBe(false)
  })

  it('keeps competition roles inside their dedicated workspaces', () => {
    expect(getAdminModulesForRole('marshal').map((module) => module.id)).toEqual(['tournaments'])
    expect(canAccessAdminPath('marshal', '/admin/sutaze/kontrolor')).toBe(true)
    expect(canAccessAdminPath('marshal', '/admin/sutaze')).toBe(false)
    expect(canAccessAdminPath('marshal', '/admin/ryby')).toBe(false)
    expect(getAdminModulesForRole('organizer').map((module) => module.id)).toEqual([
      'map',
      'tournaments',
      'notifications',
      'sponsors',
    ])
  })

  it('matches nested admin routes to the owning module', () => {
    const module = findAdminModuleByPath('/admin/rezervacie/detail/test')

    expect(module?.id).toBe('reservations')
    expect(getAdminModuleAccess(module!, 'manager')).toBe('full')
    expect(canAccessAdminPath('team', '/admin/rezervacie/detail/test')).toBe(false)
  })

  it('keeps anglers and tournament teams outside the admin navigation', () => {
    expect(getAdminModulesForRole('angler')).toEqual([])
    expect(getAdminModulesForRole('team')).toEqual([])
    expect(canAccessAdminPath('team', '/admin/sutaze')).toBe(false)
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
    expect(canOperateAdminModule('worker', 'issues')).toBe(true)
    expect(canManageAdminModule('worker', 'issues')).toBe(false)
    expect(canManageAdminModule('worker', 'closures')).toBe(false)
  })
})
