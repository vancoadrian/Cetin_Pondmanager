import { describe, expect, it } from 'vitest'
import type { Tournament, TournamentCatch } from '~/app/data/pond'
import {
  createTournamentLeaderboardCsvExport,
  createTournamentLeaderboardFeed,
  getTournamentLeaderboard,
  getTournamentLeaderboardStats,
} from '~/app/utils/tournamentLeaderboard'

const tournament: Tournament = {
  dateRange: '1. 8. - 3. 8. 2026',
  id: 'cup-2026',
  lake: 'velky-cetin',
  name: 'Carp Cup',
  sectors: [
    { id: 'a1', label: 'A1', team: 'Team A', weightKg: 18.6, x: 20, y: 30 },
    { id: 'b2', label: 'B2', team: 'Team B', weightKg: 18.6, x: 40, y: 50 },
    { id: 'c3', label: 'C3', team: 'Team C', weightKg: 4.2, x: 60, y: 50 },
    { id: 'd4', label: 'D4', weightKg: 0, x: 80, y: 50 },
  ],
  status: 'live',
}

const catches: TournamentCatch[] = [
  {
    caughtAt: 'dnes 10:00',
    id: 'catch-a1-1',
    lengthCm: 86,
    measuredAt: 'dnes 10:15',
    notes: 'Overené.',
    photoLabel: 'váženie A1',
    sectorId: 'a1',
    species: 'Kapor',
    status: 'verified',
    team: 'Team A',
    tournamentId: 'cup-2026',
    verifiedByMarshalId: 'marshal-1',
    weightKg: 12.4,
  },
  {
    caughtAt: 'dnes 11:30',
    id: 'catch-a1-2',
    lengthCm: 72,
    measuredAt: 'dnes 11:45',
    notes: 'Overené.',
    photoLabel: 'váženie A1',
    sectorId: 'a1',
    species: 'Kapor',
    status: 'verified',
    team: 'Team A',
    tournamentId: 'cup-2026',
    verifiedByMarshalId: 'marshal-1',
    weightKg: 6.2,
  },
  {
    caughtAt: 'dnes 12:10',
    id: 'catch-b2-1',
    lengthCm: 93,
    measuredAt: 'čaká',
    notes: 'Čaká na kontrolóra.',
    photoLabel: 'váženie B2',
    sectorId: 'b2',
    species: 'Amur',
    status: 'waiting',
    team: 'Team B',
    tournamentId: 'cup-2026',
    verifiedByMarshalId: 'marshal-2',
    weightKg: 18.6,
  },
  {
    caughtAt: 'dnes 13:20',
    id: 'catch-c3-1',
    lengthCm: 55,
    measuredAt: 'dnes 13:30',
    notes: 'Sporné meranie.',
    photoLabel: 'váženie C3',
    sectorId: 'c3',
    species: 'Kapor',
    status: 'disputed',
    team: 'Team C',
    tournamentId: 'cup-2026',
    verifiedByMarshalId: 'marshal-3',
    weightKg: 4.2,
  },
]

describe('tournament leaderboard helpers', () => {
  it('sorts sectors by score weight and uses largest catch as a tiebreaker', () => {
    const rows = getTournamentLeaderboard(tournament, catches)

    expect(rows.map((row) => row.sectorId)).toEqual(['b2', 'a1', 'c3', 'd4'])
    expect(rows[0]).toMatchObject({
      largestCatchKg: 18.6,
      pendingCatchCount: 1,
      rank: 1,
      sectorId: 'b2',
      team: 'Team B',
    })
    expect(rows[1]).toMatchObject({
      rank: 2,
      sectorId: 'a1',
      verifiedCatchCount: 2,
      verifiedWeightKg: 18.6,
    })
  })

  it('keeps equal ranks when the score and tiebreakers match', () => {
    const rows = getTournamentLeaderboard(
      {
        ...tournament,
        sectors: [
          { id: 'a1', label: 'A1', team: 'Team A', weightKg: 0, x: 20, y: 30 },
          { id: 'b2', label: 'B2', team: 'Team B', weightKg: 0, x: 40, y: 50 },
        ],
      },
      [],
    )

    expect(rows).toMatchObject([
      { rank: 1, sectorId: 'a1' },
      { rank: 1, sectorId: 'b2' },
    ])
  })

  it('calculates public scoreboard totals and pending review counts', () => {
    const stats = getTournamentLeaderboardStats(getTournamentLeaderboard(tournament, catches))

    expect(stats).toMatchObject({
      activeTeamCount: 3,
      pendingReviewCatchCount: 2,
      totalScoreWeightKg: 41.4,
      totalVerifiedCatchCount: 2,
    })
    expect(stats.leadingRow?.sectorId).toBe('b2')
  })

  it('creates a stable public feed payload for external scoreboards', () => {
    const feed = createTournamentLeaderboardFeed(tournament, catches, '2026-08-01T12:00:00.000Z')

    expect(feed).toMatchObject({
      generatedAt: '2026-08-01T12:00:00.000Z',
      ok: true,
      stats: {
        totalScoreWeightKg: 41.4,
      },
      tournament: {
        id: 'cup-2026',
        name: 'Carp Cup',
      },
    })
    expect(feed.rows[0]).toMatchObject({
      rank: 1,
      sectorId: 'b2',
    })
  })

  it('exports leaderboard rows as semicolon separated CSV', () => {
    const csv = createTournamentLeaderboardCsvExport(getTournamentLeaderboard(tournament, catches))

    expect(csv.split('\n')[0]).toContain('Poradie;Sektor;Tím;Skóre kg')
    expect(csv).toContain('1;B2;Team B;18,6')
    expect(csv).toContain('2;A1;Team A;18,6;2;18,6')
  })
})
