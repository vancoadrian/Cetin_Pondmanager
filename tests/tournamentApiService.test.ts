import { describe, expect, it } from 'vitest'
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
  submitTournamentCatchVerification,
  submitTournamentPenalty,
  submitTournamentRequest,
  submitTournamentRequestAction,
  submitTournamentRuleCheck,
  submitTournamentTeamRegistration,
  submitTournamentTeamRegistrationDecision,
  type TournamentWorkflowState,
  updateTournamentSectors,
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
  tournamentTeamRegistrations: tournamentTeamRegistrations.map((registration) => ({ ...registration })),
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

  it('creates a tournament team registration with contact details', () => {
    const result = submitTournamentTeamRegistration(
      {
        city: 'Komárno',
        contactEmail: 'team@example.com',
        contactName: 'Martin Kontakt',
        contactPhone: '+421 900 123 456',
        memberCount: '3',
        note: 'Radi by sme sektor pri rýchlom prístupe.',
        preferredSectorId: 'd3',
        teamName: 'Komárno Carp Juniors',
        tournamentId: 'eccj-2026',
      },
      createState(),
      '2026-05-17T14:40:00.000Z',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Team registration should be valid.')

    expect(result.registration).toMatchObject({
      id: 'ttr-202605171440-komarno-carp-juniors',
      preferredSectorId: 'd3',
      status: 'submitted',
      teamName: 'Komárno Carp Juniors',
    })
  })

  it('rejects duplicate active tournament team registrations', () => {
    const result = submitTournamentTeamRegistration(
      {
        contactName: 'Tomáš Adamec',
        contactPhone: '+421 900 222 101',
        memberCount: 2,
        note: '',
        preferredSectorId: 'a1',
        teamName: 'Junior Team A',
        tournamentId: 'eccj-2026',
      },
      createState(),
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Duplicate team registration should be invalid.')

    expect(result.messages).toContain('Tím s týmto názvom už má v súťaži aktívnu prihlášku.')
  })

  it('approves a team registration and assigns the team to a sector', () => {
    const result = submitTournamentTeamRegistrationDecision(
      {
        action: 'approve',
        assignedSectorId: 'c2',
        registrationId: 'ttr-1002',
        reviewNote: 'Potvrdené telefonicky.',
      },
      createState(),
      '2026-05-17T15:10:00.000Z',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Team registration decision should be valid.')

    expect(result.registration).toMatchObject({
      assignedSectorId: 'c2',
      reviewedAt: '17. 5. 2026 17:10',
      status: 'approved',
    })
    expect(result.tournaments[0]?.sectors.find((sector) => sector.id === 'c2')?.team).toBe('Dolná Nitra Carp')
  })

  it('updates sector settings and keeps denormalized team labels in tournament operations aligned', () => {
    const state = createState()
    const nextSectors = state.tournaments[0]!.sectors.map((sector) =>
      sector.id === 'a2'
        ? {
            ...sector,
            label: 'A2',
            team: 'North Wind Carp',
            weightKg: 14.6,
            x: 73.5,
            y: 49.5,
          }
        : sector,
    )
    const result = updateTournamentSectors(
      {
        sectors: nextSectors,
        tournamentId: 'eccj-2026',
      },
      state,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Sector settings should be valid.')

    expect(result.tournament.sectors.find((sector) => sector.id === 'a2')).toMatchObject({
      team: 'North Wind Carp',
      weightKg: 14.6,
      x: 73.5,
      y: 49.5,
    })
    expect(result.tournamentRequests.find((request) => request.id === 'tr-1001')?.team).toBe('North Wind Carp')
    expect(result.tournamentCatches.find((catchItem) => catchItem.id === 'tc-502')?.team).toBe('North Wind Carp')
  })

  it('rejects sector settings that remove or duplicate existing sector IDs', () => {
    const state = createState()
    const result = updateTournamentSectors(
      {
        sectors: [
          {
            ...state.tournaments[0]!.sectors[0]!,
            id: 'a1',
          },
          {
            ...state.tournaments[0]!.sectors[1]!,
            id: 'a1',
          },
        ],
        tournamentId: 'eccj-2026',
      },
      state,
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Duplicate sector IDs should be invalid.')

    expect(result.messages).toContain('Sektorové ID musí byť jedinečné: a1.')
  })

  it('rejects sector settings that change the stable sector set during a tournament', () => {
    const state = createState()
    const result = updateTournamentSectors(
      {
        sectors: state.tournaments[0]!.sectors.slice(0, -1),
        tournamentId: 'eccj-2026',
      },
      state,
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Removed sector should be invalid.')

    expect(result.messages).toContain(
      'V tomto kroku možno upraviť existujúce sektory, nie pridávať alebo mazať sektorové ID počas súťaže.',
    )
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

  it('replays catch verification by client mutation id without changing the measured time', () => {
    const firstResult = submitTournamentCatchVerification(
      {
        catchId: 'tc-502',
        clientMutationId: 'offline-catch-verify-1',
        status: 'verified',
      },
      createState(),
      '2026-05-17T15:05:00.000Z',
    )

    expect(firstResult.ok).toBe(true)
    if (!firstResult.ok) throw new Error('Catch verification should be valid.')

    const replayResult = submitTournamentCatchVerification(
      {
        catchId: 'tc-502',
        clientMutationId: 'offline-catch-verify-1',
        status: 'verified',
      },
      firstResult,
      '2026-05-17T16:45:00.000Z',
    )

    expect(replayResult.ok).toBe(true)
    if (!replayResult.ok) throw new Error('Catch verification replay should be valid.')

    expect(replayResult.idempotentReplay).toBe(true)
    expect(replayResult.catchItem.measuredAt).toBe('17. 5. 2026 17:05')
    expect(replayResult.catchItem.verificationClientMutationId).toBe('offline-catch-verify-1')
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

  it('replays a penalty by client mutation id without duplicating the penalty or mirrored check', () => {
    const payload = {
      clientMutationId: 'offline-penalty-1',
      durationHours: 2,
      marshalId: 'marshal-2',
      reason: 'Jeden prút bol nahodený mimo povolený limit sektora.',
      rodsLess: 1,
      sectorId: 'b4',
      tournamentId: 'eccj-2026',
      type: 'rod-reduction',
    } as const
    const firstResult = submitTournamentPenalty(payload, createState(), '2026-05-17T16:20:00.000Z')

    expect(firstResult.ok).toBe(true)
    if (!firstResult.ok) throw new Error('Penalty should be valid.')

    const replayResult = submitTournamentPenalty(payload, firstResult, '2026-05-17T18:00:00.000Z')

    expect(replayResult.ok).toBe(true)
    if (!replayResult.ok) throw new Error('Penalty replay should be valid.')

    expect(replayResult.idempotentReplay).toBe(true)
    expect(replayResult.penalty.id).toBe(firstResult.penalty.id)
    expect(replayResult.tournamentPenalties.filter((penalty) => penalty.clientMutationId === payload.clientMutationId)).toHaveLength(1)
    expect(replayResult.tournamentRuleChecks.filter((check) => check.clientMutationId === `${payload.clientMutationId}:penalty-check`)).toHaveLength(1)
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

  it('replays a standalone rule check by client mutation id without duplicating it', () => {
    const payload = {
      clientMutationId: 'offline-check-1',
      marshalId: 'marshal-1',
      note: 'Montáže, počet prútov a podložka bez porušenia.',
      result: 'ok',
      sectorId: 'a1',
      tournamentId: 'eccj-2026',
    } as const
    const firstResult = submitTournamentRuleCheck(payload, createState(), '2026-05-17T16:35:00.000Z')

    expect(firstResult.ok).toBe(true)
    if (!firstResult.ok) throw new Error('Rule check should be valid.')

    const replayResult = submitTournamentRuleCheck(payload, firstResult, '2026-05-17T18:00:00.000Z')

    expect(replayResult.ok).toBe(true)
    if (!replayResult.ok) throw new Error('Rule check replay should be valid.')

    expect(replayResult.idempotentReplay).toBe(true)
    expect(replayResult.check.id).toBe(firstResult.check.id)
    expect(replayResult.tournamentRuleChecks.filter((check) => check.clientMutationId === payload.clientMutationId)).toHaveLength(1)
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
