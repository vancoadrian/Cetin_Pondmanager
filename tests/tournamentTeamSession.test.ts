import { describe, expect, it } from 'vitest'
import {
  createTournamentTeamSession,
  isTournamentTeamSessionForSector,
  parseTournamentTeamSession,
  serializeTournamentTeamSession,
  touchTournamentTeamSession,
} from '~/app/utils/tournamentTeamSession'
import type { TournamentTeamAccessSummary } from '~/app/utils/tournamentTeamAccess'

const summary: TournamentTeamAccessSummary = {
  code: 'ECCJ-2026-A1',
  codeUrl: '/sutaze/tim?kod=ECCJ-2026-A1',
  hasAssignedTeam: true,
  sectorId: 'sector-a1',
  sectorLabel: 'A1',
  teamName: 'Carp Team',
  title: 'A1 · Carp Team',
  url: '/sutaze/tim?turnaj=eccj-2026&sektor=sector-a1',
}

describe('tournament team session helpers', () => {
  it('creates a stable local team session from an access summary', () => {
    expect(createTournamentTeamSession(summary, 'eccj-2026', '2026-06-15T10:00:00.000Z')).toEqual({
      code: 'ECCJ-2026-A1',
      createdAt: '2026-06-15T10:00:00.000Z',
      id: 'eccj-2026:sector-a1',
      lastSeenAt: '2026-06-15T10:00:00.000Z',
      sectorId: 'sector-a1',
      sectorLabel: 'A1',
      teamName: 'Carp Team',
      tournamentId: 'eccj-2026',
    })
  })

  it('serializes and parses a team session safely', () => {
    const session = createTournamentTeamSession(summary, 'eccj-2026', '2026-06-15T10:00:00.000Z')

    expect(parseTournamentTeamSession(serializeTournamentTeamSession(session))).toEqual(session)
  })

  it('ignores invalid stored values', () => {
    expect(parseTournamentTeamSession('{broken')).toBeUndefined()
    expect(parseTournamentTeamSession(JSON.stringify({ sectorId: 'sector-a1' }))).toBeUndefined()
  })

  it('touches last seen without changing the identity', () => {
    const session = createTournamentTeamSession(summary, 'eccj-2026', '2026-06-15T10:00:00.000Z')

    expect(touchTournamentTeamSession(session, '2026-06-15T11:30:00.000Z')).toMatchObject({
      id: 'eccj-2026:sector-a1',
      lastSeenAt: '2026-06-15T11:30:00.000Z',
    })
  })

  it('checks whether the local session belongs to the selected sector', () => {
    const session = createTournamentTeamSession(summary, 'eccj-2026')

    expect(isTournamentTeamSessionForSector(session, 'eccj-2026', 'sector-a1')).toBe(true)
    expect(isTournamentTeamSessionForSector(session, 'eccj-2026', 'sector-b2')).toBe(false)
    expect(isTournamentTeamSessionForSector(undefined, 'eccj-2026', 'sector-a1')).toBe(false)
  })
})
