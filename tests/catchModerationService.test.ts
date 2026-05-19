import { describe, expect, it } from 'vitest'
import { catches, tripLogbookEntries, tripLogbooks } from '~/app/data/pond'
import type { CatchWorkflowState } from '~/app/services/catchApiService'
import { submitCatchModerationDecision } from '~/app/services/catchModerationService'

function createState(): CatchWorkflowState {
  return {
    catchPhotos: [],
    catches: catches.map((catchItem, index) => ({
      ...catchItem,
      status: index === 0 ? 'pending' : catchItem.status,
    })),
    tripLogbookEntries: tripLogbookEntries.map((entry) => ({ ...entry })),
    tripLogbooks: tripLogbooks.map((logbook) => ({
      ...logbook,
      members: logbook.members.map((member) => ({ ...member })),
      pegIds: [...logbook.pegIds],
    })),
  }
}

describe('catchModerationService', () => {
  it('approves a pending catch and keeps review metadata', () => {
    const state = createState()
    const catchId = state.catches[0]!.id
    const result = submitCatchModerationDecision(
      {
        catchId,
        decisionMode: 'approve',
        note: 'Fotka a rozmery sedia.',
      },
      state,
      'Správca Cetín',
      '2026-05-17T12:00:00.000Z',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Catch moderation should be valid.')

    expect(result.catch).toMatchObject({
      id: catchId,
      reviewNote: 'Fotka a rozmery sedia.',
      reviewedAt: '2026-05-17T12:00:00.000Z',
      reviewedBy: 'Správca Cetín',
      status: 'approved',
    })
    expect(result.catches.find((catchItem) => catchItem.id === catchId)?.status).toBe('approved')
    expect(result.message).toContain('verejnom denníku')
  })

  it('rejects a catch without mutating the original workflow state', () => {
    const state = createState()
    const catchId = state.catches[0]!.id
    const result = submitCatchModerationDecision(
      {
        catchId,
        decisionMode: 'reject',
        note: 'Nesedí miesto ani čas úlovku.',
      },
      state,
      'Kontrolór',
      '2026-05-17T13:00:00.000Z',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Catch rejection should be valid.')

    expect(result.catch.status).toBe('rejected')
    expect(result.catch.reviewNote).toBe('Nesedí miesto ani čas úlovku.')
    expect(state.catches.find((catchItem) => catchItem.id === catchId)?.status).toBe('pending')
  })

  it('returns a validation failure for unknown catches', () => {
    const result = submitCatchModerationDecision(
      {
        catchId: 'missing-catch',
        decisionMode: 'approve',
        note: '',
      },
      createState(),
    )

    expect(result).toEqual({
      messages: ['Úlovok sa nenašiel v lokálnom mock stave.'],
      ok: false,
      statusCode: 404,
    })
  })
})
