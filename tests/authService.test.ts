import { describe, expect, it } from 'vitest'
import {
  authenticateMockUser,
  canUseTournamentTeamScope,
  findMockUserById,
  getAuthenticatedHome,
  isSafeAppRedirect,
} from '~/app/composables/useMockAuth'

describe('application authentication contract', () => {
  it('authenticates by normalized email and password', () => {
    expect(authenticateMockUser('  MAREK.HORVATH@EXAMPLE.TEST ', 'Cetin2026!')?.role).toBe('angler')
    expect(authenticateMockUser('marek.h@example.com', 'Cetin2026!')?.id).toBe('angler-marek')
    expect(authenticateMockUser('marek.horvath@example.test', 'wrong')).toBeUndefined()
    expect(authenticateMockUser('marek.h@example.com', 'wrong')).toBeUndefined()
  })

  it('routes every role to its own workspace', () => {
    expect(getAuthenticatedHome('angler')).toBe('/konto')
    expect(getAuthenticatedHome('team')).toBe('/sutaze/tim')
    expect(getAuthenticatedHome('marshal')).toBe('/admin/sutaze/kontrolor')
    expect(getAuthenticatedHome('organizer')).toBe('/admin/sutaze')
    expect(getAuthenticatedHome('accountant')).toBe('/admin/rezervacie')
    expect(getAuthenticatedHome('worker')).toBe('/admin/hlasenia')
    expect(getAuthenticatedHome('manager')).toBe('/admin')
  })

  it('accepts only local application redirects', () => {
    expect(isSafeAppRedirect('/rezervacie?jazero=velky-cetin')).toBe(true)
    expect(isSafeAppRedirect('//example.com')).toBe(false)
    expect(isSafeAppRedirect('https://example.com')).toBe(false)
  })

  it('limits a team account to its assigned tournament sector', () => {
    const team = findMockUserById('team')

    expect(canUseTournamentTeamScope(team, 'eccj-2026', 'a1')).toBe(true)
    expect(canUseTournamentTeamScope(team, 'eccj-2026', 'b4')).toBe(false)
    expect(canUseTournamentTeamScope(findMockUserById('organizer'), 'eccj-2026', 'a1')).toBe(false)
  })
})
