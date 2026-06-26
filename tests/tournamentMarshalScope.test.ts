import { describe, expect, it } from 'vitest'
import { findMockUserById } from '~/app/composables/useMockAuth'
import { tournamentMarshals } from '~/app/data/pond'
import { getTournamentMarshalScopeDecision } from '~/app/utils/tournamentMarshalScope'

describe('tournament marshal mutation scope', () => {
  it('forces a marshal to its configured identity and assigned sector', () => {
    const decision = getTournamentMarshalScopeDecision(
      findMockUserById('marshal'),
      tournamentMarshals,
      {
        sectorId: 'a2',
        tournamentId: 'eccj-2026',
      },
    )

    expect(decision).toMatchObject({
      allowed: true,
      marshalId: 'marshal-1',
      scoped: true,
    })
  })

  it('rejects another sector, tournament or marshal identity', () => {
    const marshal = findMockUserById('marshal')

    expect(getTournamentMarshalScopeDecision(marshal, tournamentMarshals, {
      sectorId: 'b4',
      tournamentId: 'eccj-2026',
    }).allowed).toBe(false)
    expect(getTournamentMarshalScopeDecision(marshal, tournamentMarshals, {
      sectorId: 'a1',
      tournamentId: 'other',
    }).allowed).toBe(false)
    expect(getTournamentMarshalScopeDecision(marshal, tournamentMarshals, {
      requestedMarshalId: 'marshal-2',
      sectorId: 'a1',
      tournamentId: 'eccj-2026',
    }).allowed).toBe(false)
    expect(getTournamentMarshalScopeDecision(marshal, tournamentMarshals, {
      assignedMarshalId: 'marshal-2',
      sectorId: 'a1',
      tournamentId: 'eccj-2026',
    }).allowed).toBe(false)
  })

  it('leaves manager and organizer mutations unscoped', () => {
    expect(getTournamentMarshalScopeDecision(
      findMockUserById('manager'),
      tournamentMarshals,
      {
        requestedMarshalId: 'marshal-2',
        sectorId: 'b4',
        tournamentId: 'eccj-2026',
      },
    )).toEqual({
      allowed: true,
      marshalId: 'marshal-2',
      scoped: false,
    })
  })
})
