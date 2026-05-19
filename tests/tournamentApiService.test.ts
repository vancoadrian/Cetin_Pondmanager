import { describe, expect, it } from 'vitest'
import {
  tournamentCatches,
  tournamentMarshals,
  tournamentPenalties,
  tournamentRequests,
  tournamentRuleChecks,
  tournaments,
} from '~/app/data/pond'
import {
  submitTournamentCatchVerification,
  submitTournamentPenalty,
  submitTournamentRequest,
  submitTournamentRequestAction,
  submitTournamentRuleCheck,
  type TournamentWorkflowState,
} from '~/app/services/tournamentApiService'

const createState = (): TournamentWorkflowState => ({
  tournamentCatches: tournamentCatches.map((catchItem) => ({ ...catchItem })),
  tournamentMarshals: tournamentMarshals.map((marshal) => ({
    ...marshal,
    assignedSectorIds: [...marshal.assignedSectorIds],
  })),
  tournamentPenalties: tournamentPenalties.map((penalty) => ({ ...penalty })),
  tournamentRequests: tournamentRequests.map((request) => ({ ...request })),
  tournamentRuleChecks: tournamentRuleChecks.map((check) => ({ ...check })),
  tournaments: tournaments.map((tournament) => ({
    ...tournament,
    sectors: tournament.sectors.map((sector) => ({ ...sector })),
  })),
})

describe('tournamentApiService', () => {
  it('creates a high-priority catch measurement request for a sector team', () => {
    const result = submitTournamentRequest(
      {
        description: '',
        sectorId: 'a2',
        tournamentId: 'eccj-2026',
        type: 'catch-measurement',
      },
      createState(),
      '2026-05-17T14:30:00.000Z',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Tournament request should be valid.')

    expect(result.request).toMatchObject({
      id: 'tr-202605171430-a2-catch-measurement',
      priority: 'high',
      status: 'new',
      team: 'Morava Carp',
    })
  })

  it('assigns a request to a marshal responsible for the sector', () => {
    const result = submitTournamentRequestAction(
      {
        action: 'assign',
        requestId: 'tr-1002',
      },
      createState(),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Assign action should be valid.')

    const request = result.tournamentRequests.find((item) => item.id === 'tr-1002')
    expect(request).toMatchObject({
      assignedMarshalId: 'marshal-2',
      status: 'assigned',
    })
  })

  it('marks waiting tournament catch as verified', () => {
    const result = submitTournamentCatchVerification(
      {
        catchId: 'tc-502',
        status: 'verified',
      },
      createState(),
      '2026-05-17T15:05:00.000Z',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Catch verification should be valid.')

    expect(result.catchItem).toMatchObject({
      id: 'tc-502',
      measuredAt: '17. 5. 2026 17:05',
      status: 'verified',
    })
    expect(result.tournamentMarshals.find((marshal) => marshal.id === 'marshal-1')?.status).toBe('available')
  })

  it('rejects non-catch reports without a useful description', () => {
    const result = submitTournamentRequest(
      {
        description: 'krátke',
        sectorId: 'a2',
        tournamentId: 'eccj-2026',
        type: 'rule-report',
      },
      createState(),
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Short rule report should be invalid.')

    expect(result.messages).toContain('Pri hlásení porušenia, technickej pomoci alebo inom hlásení doplňte stručný popis.')
  })

  it('creates an active penalty and mirrors it into rule checks', () => {
    const result = submitTournamentPenalty(
      {
        durationHours: 2,
        marshalId: 'marshal-2',
        reason: 'Jeden prút bol nahodený mimo povolený limit sektora.',
        rodsLess: 1,
        sectorId: 'b4',
        tournamentId: 'eccj-2026',
        type: 'rod-reduction',
      },
      createState(),
      '2026-05-17T16:20:00.000Z',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Penalty should be valid.')

    expect(result.penalty).toMatchObject({
      id: 'tp-202605171620-b4-rod-reduction',
      status: 'active',
      team: 'South Lake',
    })
    expect(result.tournamentRuleChecks[0]).toMatchObject({
      result: 'penalty',
      sectorId: 'b4',
    })
  })

  it('creates a standalone rule check for an assigned marshal sector', () => {
    const result = submitTournamentRuleCheck(
      {
        marshalId: 'marshal-1',
        note: 'Montáže, počet prútov a podložka bez porušenia.',
        result: 'ok',
        sectorId: 'a1',
        tournamentId: 'eccj-2026',
      },
      createState(),
      '2026-05-17T16:35:00.000Z',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Rule check should be valid.')

    expect(result.check).toMatchObject({
      id: 'check-202605171635-a1-ok',
      marshalId: 'marshal-1',
      result: 'ok',
    })
  })

  it('rejects penalties when the marshal is not assigned to the selected sector', () => {
    const result = submitTournamentPenalty(
      {
        marshalId: 'marshal-1',
        reason: 'Jeden prút bol nahodený mimo povolený limit sektora.',
        sectorId: 'b4',
        tournamentId: 'eccj-2026',
        type: 'warning',
      },
      createState(),
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Wrong marshal sector should be invalid.')

    expect(result.messages).toContain('Vybraný kontrolór nemá priradený tento sektor.')
  })
})
