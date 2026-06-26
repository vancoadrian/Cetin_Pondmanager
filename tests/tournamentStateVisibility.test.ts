import { describe, expect, it } from 'vitest'
import { findMockUserById } from '~/app/composables/useMockAuth'
import {
  tournamentCatches,
  tournamentMarshals,
  tournamentPenalties,
  tournamentRequests,
  tournamentRuleChecks,
  tournamentTeamRegistrations,
  tournaments,
} from '~/app/data/pond'
import {
  createPublicTournamentStateResponse,
  createTournamentAccountStateResponse,
} from '~/app/utils/tournamentStateVisibility'

const state = {
  tournamentCatches,
  tournamentMarshals,
  tournamentPenalties,
  tournamentRequests,
  tournamentRuleChecks,
  tournamentTeamRegistrations,
  tournaments,
}

describe('tournament state visibility', () => {
  it('removes internal competition data from the public response', () => {
    const response = createPublicTournamentStateResponse(state, 'test')

    expect(response.tournamentMarshals).toEqual([])
    expect(response.tournamentPenalties).toEqual([])
    expect(response.tournamentRequests).toEqual([])
    expect(response.tournamentRuleChecks).toEqual([])
    expect(response.tournamentTeamRegistrations).toEqual([])
    expect(response.tournamentCatches.every((catchItem) => catchItem.status === 'verified')).toBe(true)
    expect(response.tournamentCatches.every((catchItem) => catchItem.verifiedByMarshalId === '')).toBe(true)
    expect(response.tournamentCatches.every((catchItem) => catchItem.notes === '')).toBe(true)
    expect(response.tournaments[0]?.sectors.find((sector) => sector.id === 'a1')?.weightKg).toBe(12.4)
    expect(response.tournaments[0]?.sectors.find((sector) => sector.id === 'a2')?.weightKg).toBe(0)
    expect(response.tournaments[0]?.sectors.find((sector) => sector.id === 'b1')?.weightKg).toBe(6.2)
  })

  it('limits a team account to its tournament sector', () => {
    const response = createTournamentAccountStateResponse(state, findMockUserById('team'), 'test')

    expect(response?.tournaments).toHaveLength(1)
    expect(response?.tournaments[0]?.sectors.map((sector) => sector.id)).toEqual(['a1'])
    expect(response?.tournamentRequests.every((request) => request.sectorId === 'a1')).toBe(true)
    expect(response?.tournamentCatches.every((catchItem) => catchItem.sectorId === 'a1')).toBe(true)
    expect(response?.tournamentRuleChecks).toEqual([])
    expect(response?.tournamentTeamRegistrations).toEqual([])
  })

  it('limits a marshal account to its identity and assigned sectors', () => {
    const response = createTournamentAccountStateResponse(state, findMockUserById('marshal'), 'test')

    expect(response?.tournamentMarshals.map((marshal) => marshal.id)).toEqual(['marshal-1'])
    expect(response?.tournaments[0]?.sectors.map((sector) => sector.id)).toEqual(['a1', 'a2', 'a3'])
    expect(response?.tournamentRequests.every((request) => ['a1', 'a2', 'a3'].includes(request.sectorId))).toBe(true)
    expect(response?.tournamentPenalties.every((penalty) => ['a1', 'a2', 'a3'].includes(penalty.sectorId))).toBe(true)
  })
})
