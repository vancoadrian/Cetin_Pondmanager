import { describe, expect, it } from 'vitest'
import {
  getAdminApiAccessDecision,
  isMockAdminRole,
} from '~/app/utils/adminAccess'

describe('admin API access guard', () => {
  it('recognizes only configured mock admin roles', () => {
    expect(isMockAdminRole('manager')).toBe(true)
    expect(isMockAdminRole('angler')).toBe(false)
    expect(isMockAdminRole('team')).toBe(false)
    expect(isMockAdminRole(null)).toBe(false)
  })

  it('requires a mock admin session for internal endpoints', () => {
    const decision = getAdminApiAccessDecision(undefined, { moduleId: 'audit' })

    expect(decision.allowed).toBe(false)
    expect(decision.statusCode).toBe(401)
    expect(decision.statusMessage).toBe('Admin login required')
  })

  it('allows read-only roles to read but not mutate their modules', () => {
    const readDecision = getAdminApiAccessDecision('accountant', { moduleId: 'catches' })
    const writeDecision = getAdminApiAccessDecision('accountant', {
      moduleId: 'catches',
      mode: 'operate',
    })

    expect(readDecision.allowed).toBe(true)
    expect(readDecision.currentMode).toBe('read')
    expect(writeDecision.allowed).toBe(false)
    expect(writeDecision.statusCode).toBe(403)
  })

  it('matches module-specific operate and full access requirements', () => {
    expect(getAdminApiAccessDecision('worker', {
      moduleId: 'reservations',
      mode: 'operate',
    }).allowed).toBe(true)
    expect(getAdminApiAccessDecision('organizer', {
      moduleId: 'notifications',
      mode: 'operate',
    }).allowed).toBe(true)
    expect(getAdminApiAccessDecision('worker', {
      moduleId: 'issues',
      mode: 'operate',
    }).allowed).toBe(true)
    expect(getAdminApiAccessDecision('marshal', {
      moduleId: 'issues',
      mode: 'operate',
    }).allowed).toBe(false)
    expect(getAdminApiAccessDecision('organizer', {
      moduleId: 'map',
      mode: 'full',
    }).allowed).toBe(false)
    expect(getAdminApiAccessDecision('manager', {
      moduleId: 'map',
      mode: 'full',
    }).allowed).toBe(true)
    expect(getAdminApiAccessDecision('marshal', {
      moduleId: 'fish',
      mode: 'operate',
    }).allowed).toBe(false)
    expect(getAdminApiAccessDecision('accountant', {
      moduleId: 'fish',
      mode: 'operate',
    }).allowed).toBe(false)
  })
})
