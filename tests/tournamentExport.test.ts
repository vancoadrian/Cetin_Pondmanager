import { describe, expect, it } from 'vitest'
import type {
  Tournament,
  TournamentCatch,
  TournamentMarshal,
  TournamentPenalty,
  TournamentRequest,
  TournamentRuleCheck,
  TournamentTeamRegistration,
} from '~/app/data/pond'
import {
  createTournamentOrganizerCsvExport,
  summarizeTournamentOrganizerExport,
} from '~/app/utils/tournamentExport'

const tournament: Tournament = {
  dateRange: '1. 8. - 3. 8. 2026',
  id: 'cup-2026',
  lake: 'velky-cetin',
  name: 'Carp Cup',
  sectors: [
    { id: 'a1', label: 'A1', team: 'Team A', weightKg: 12.4, x: 20, y: 30 },
    { id: 'b2', label: 'B2', team: 'Team B', weightKg: 0, x: 40, y: 50 },
  ],
  status: 'live',
}

const state = {
  tournamentCatches: [
    {
      caughtAt: 'dnes 10:00',
      id: 'catch-a1-1',
      lengthCm: 86,
      measuredAt: 'dnes 10:15',
      notes: 'Overené, bez námietok.',
      photoLabel: 'váženie A1',
      sectorId: 'a1',
      species: 'Kapor',
      status: 'verified',
      team: 'Team A',
      tournamentId: 'cup-2026',
      verifiedByMarshalId: 'marshal-1',
      weightKg: 12.4,
    },
  ] satisfies TournamentCatch[],
  tournamentMarshals: [
    {
      assignedSectorIds: ['a1', 'b2'],
      id: 'marshal-1',
      name: 'Peter H.',
      phone: '+421 900 111 201',
      status: 'available',
    },
  ] satisfies TournamentMarshal[],
  tournamentPenalties: [
    {
      durationHours: 2,
      endsAt: 'dnes 13:30',
      id: 'penalty-1',
      issuedAt: 'dnes 11:30',
      issuedByMarshalId: 'marshal-1',
      reason: 'Jeden prút bol nahodený mimo povolený limit sektora.',
      rodsLess: 1,
      sectorId: 'a1',
      startsAt: 'dnes 11:30',
      status: 'active',
      team: 'Team A',
      tournamentId: 'cup-2026',
      type: 'rod-reduction',
    },
  ] satisfies TournamentPenalty[],
  tournamentRequests: [
    {
      assignedMarshalId: 'marshal-1',
      createdAt: 'dnes 10:05',
      description: 'Tím žiada meranie úlovku pri brehu.',
      id: 'request-1',
      priority: 'high',
      sectorId: 'a1',
      status: 'assigned',
      team: 'Team A',
      tournamentId: 'cup-2026',
      type: 'catch-measurement',
    },
  ] satisfies TournamentRequest[],
  tournamentRuleChecks: [
    {
      checkedAt: 'dnes 11:30',
      id: 'check-1',
      marshalId: 'marshal-1',
      note: 'Kontrola; udelený trest o prút menej.',
      result: 'penalty',
      sectorId: 'a1',
      tournamentId: 'cup-2026',
    },
  ] satisfies TournamentRuleCheck[],
  tournamentTeamRegistrations: [
    {
      assignedSectorId: 'a1',
      city: 'Nitra',
      contactName: 'Tomáš Adamec',
      contactPhone: '+421 900 222 101',
      createdAt: '12. 5. 2026 18:15',
      id: 'registration-1',
      memberCount: 2,
      note: 'Prosíme sektor A1.',
      preferredSectorId: 'a1',
      reviewedAt: '13. 5. 2026 09:20',
      reviewNote: 'Potvrdené.',
      status: 'approved',
      teamName: 'Team A',
      tournamentId: 'cup-2026',
    },
  ] satisfies TournamentTeamRegistration[],
}

describe('tournament organizer export', () => {
  it('creates a multi-section CSV export for the organizer', () => {
    const csv = createTournamentOrganizerCsvExport(tournament, state, '2026-08-01T12:00:00.000Z')

    expect(csv).toContain('Rybolov Cetín - organizačný export súťaže')
    expect(csv).toContain('Výsledkovka')
    expect(csv).toContain('Váženia úlovkov')
    expect(csv).toContain('Tresty')
    expect(csv).toContain('Hlásenia tímov')
    expect(csv).toContain('Prihlášky tímov')
    expect(csv).toContain('Kontrolóri')
    expect(csv).toContain('A1;Team A;Kapor;12,4;86')
    expect(csv).toContain('"Kontrola; udelený trest o prút menej."')
  })

  it('summarizes export contents for admin UI or future delivery logs', () => {
    expect(summarizeTournamentOrganizerExport(tournament, state)).toEqual({
      catchCount: 1,
      penaltyCount: 1,
      registrationCount: 1,
      requestCount: 1,
      sectorCount: 2,
      totalCatchWeightKg: 12.4,
    })
  })
})
