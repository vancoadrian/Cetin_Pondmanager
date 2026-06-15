import { describe, expect, it } from 'vitest'
import type { Tournament } from '~/app/data/pond'
import {
  createTournamentTeamAccessCode,
  createTournamentTeamAccessCodeUrl,
  createTournamentTeamAccessCsv,
  createTournamentTeamAccessUrl,
  getTournamentTeamAccessRows,
  getTournamentTeamAccessSummary,
  normalizeTournamentTeamAccessCode,
  resolveTournamentTeamAccessCode,
} from '~/app/utils/tournamentTeamAccess'

const tournament: Tournament = {
  dateRange: '1. 8. - 3. 8. 2026',
  id: 'summer cup 2026',
  lake: 'velky-cetin',
  name: 'Summer Cup',
  operationsMode: 'full-dispatch',
  sectors: [
    { id: 'a1', label: 'A1', team: 'Carp Team', weightKg: 11.2, x: 20, y: 30 },
    { id: 'b2', label: 'B2', weightKg: 0, x: 40, y: 50 },
  ],
  status: 'live',
}

describe('tournament team access helpers', () => {
  it('creates a stable encoded team panel url', () => {
    expect(createTournamentTeamAccessUrl('summer cup 2026', 'a1')).toBe('/sutaze/tim?sektor=a1&turnaj=summer+cup+2026')
  })

  it('creates a readable access code and code url', () => {
    expect(createTournamentTeamAccessCode('summer cup 2026', 'a1')).toBe('SUMMER-CUP-2026-A1')
    expect(createTournamentTeamAccessCodeUrl('SUMMER-CUP-2026-A1')).toBe('/sutaze/tim?kod=SUMMER-CUP-2026-A1')
  })

  it('normalizes manually entered team access codes', () => {
    expect(normalizeTournamentTeamAccessCode(' summer cup 2026 / á1 ')).toBe('SUMMER-CUP-2026-A1')
  })

  it('resolves a team access code back to tournament and sector ids', () => {
    expect(resolveTournamentTeamAccessCode([tournament], 'summer cup 2026 a1')).toEqual({
      sectorId: 'a1',
      tournamentId: 'summer cup 2026',
    })
  })

  it('summarizes assigned team access details', () => {
    expect(getTournamentTeamAccessSummary(tournament, 'a1')).toEqual({
      code: 'SUMMER-CUP-2026-A1',
      codeUrl: '/sutaze/tim?kod=SUMMER-CUP-2026-A1',
      hasAssignedTeam: true,
      sectorId: 'a1',
      sectorLabel: 'A1',
      teamName: 'Carp Team',
      title: 'A1 · Carp Team',
      url: '/sutaze/tim?sektor=a1&turnaj=summer+cup+2026',
    })
  })

  it('falls back gracefully for a sector without a team', () => {
    expect(getTournamentTeamAccessSummary(tournament, 'b2')).toMatchObject({
      hasAssignedTeam: false,
      sectorLabel: 'B2',
      teamName: 'Nepriradený tím',
    })
  })

  it('returns access rows for every tournament sector', () => {
    expect(getTournamentTeamAccessRows(tournament).map((row) => row.sectorId)).toEqual(['a1', 'b2'])
  })

  it('exports team access rows as csv with absolute code urls', () => {
    expect(createTournamentTeamAccessCsv(tournament, 'https://rybolov.test')).toContain(
      'A1,Carp Team,SUMMER-CUP-2026-A1,https://rybolov.test/sutaze/tim?kod=SUMMER-CUP-2026-A1',
    )
  })
})
