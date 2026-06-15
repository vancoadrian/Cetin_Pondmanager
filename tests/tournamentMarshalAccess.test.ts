import { describe, expect, it } from 'vitest'
import type { Tournament, TournamentMarshal } from '~/app/data/pond'
import {
  createTournamentMarshalAccessUrl,
  getTournamentMarshalAccessRows,
} from '~/app/utils/tournamentMarshalAccess'

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

const marshals: TournamentMarshal[] = [
  {
    assignedSectorIds: ['a1', 'b2'],
    id: 'marshal 1',
    name: 'Peter H.',
    phone: '+421 900 111 201',
    status: 'available',
  },
]

describe('tournament marshal access helpers', () => {
  it('creates a stable encoded marshal panel url', () => {
    expect(createTournamentMarshalAccessUrl('summer cup 2026', 'marshal 1')).toBe(
      '/admin/sutaze/kontrolor?kontrolor=marshal+1&turnaj=summer+cup+2026',
    )
  })

  it('summarizes marshal sectors for admin links', () => {
    expect(getTournamentMarshalAccessRows(tournament, marshals)).toEqual([
      {
        assignedSectorIds: ['a1', 'b2'],
        marshalId: 'marshal 1',
        marshalName: 'Peter H.',
        phone: '+421 900 111 201',
        sectorLabels: ['A1', 'B2'],
        status: 'available',
        url: '/admin/sutaze/kontrolor?kontrolor=marshal+1&turnaj=summer+cup+2026',
      },
    ])
  })
})
