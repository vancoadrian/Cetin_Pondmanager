import { describe, expect, it } from 'vitest'
import {
  createOfflineTournamentRequestQueueItem,
  getOfflineTournamentRequestQueueErrorMessage,
  getTournamentRequestFetchErrorStatusCode,
  sanitizeOfflineTournamentRequestQueueItems,
  shouldQueueTournamentRequestSubmission,
  type OfflineTournamentRequestPayload,
} from '~/app/services/offlineTournamentRequestQueueService'

const payload: OfflineTournamentRequestPayload = {
  description: '',
  sectorId: 'sector-b',
  tournamentId: 'spring-carp-cup-2026',
  type: 'catch-measurement',
}

describe('offlineTournamentRequestQueueService', () => {
  it('creates a valid offline tournament request queue item', () => {
    const item = createOfflineTournamentRequestQueueItem(payload, {
      id: 'offline-tournament-test',
      now: '2026-05-20T12:00:00.000Z',
    })

    expect(item).toMatchObject({
      attempts: 0,
      createdAt: '2026-05-20T12:00:00.000Z',
      id: 'offline-tournament-test',
      payload,
      updatedAt: '2026-05-20T12:00:00.000Z',
    })
  })

  it('drops corrupt queue records and keeps valid requests ordered by creation time', () => {
    const first = createOfflineTournamentRequestQueueItem(payload, {
      id: 'first',
      now: '2026-05-20T10:00:00.000Z',
    })
    const second = createOfflineTournamentRequestQueueItem({
      ...payload,
      description: 'Tím v sektore žiada technickú pomoc so signalizátorom.',
      sectorId: 'sector-c',
      type: 'technical-help',
    }, {
      id: 'second',
      now: '2026-05-20T11:00:00.000Z',
    })

    expect(sanitizeOfflineTournamentRequestQueueItems([
      second,
      { id: 'broken', payload: { type: 'technical-help' } },
      first,
      undefined,
    ])).toEqual([first, second])
  })

  it('queues tournament requests only for network-like failures or offline state', () => {
    expect(shouldQueueTournamentRequestSubmission(new Error('Failed to fetch'), true)).toBe(true)
    expect(shouldQueueTournamentRequestSubmission({ statusCode: 422 }, true)).toBe(false)
    expect(shouldQueueTournamentRequestSubmission({ response: { status: 500 } }, true)).toBe(false)
    expect(shouldQueueTournamentRequestSubmission({ statusCode: 422 }, false)).toBe(true)
  })

  it('extracts status and validation messages from fetch-like errors', () => {
    expect(getTournamentRequestFetchErrorStatusCode({ data: { statusCode: 404 } })).toBe(404)
    expect(getTournamentRequestFetchErrorStatusCode({ response: { status: 503 } })).toBe(503)
    expect(getOfflineTournamentRequestQueueErrorMessage({
      data: {
        data: {
          messages: ['Súťaž alebo sektor sa v lokálnom stave nenašli.'],
        },
      },
    })).toBe('Súťaž alebo sektor sa v lokálnom stave nenašli.')
  })
})
