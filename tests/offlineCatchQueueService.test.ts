import { describe, expect, it } from 'vitest'
import {
  createOfflineCatchQueueItem,
  getFetchErrorStatusCode,
  getOfflineCatchQueueErrorMessage,
  sanitizeOfflineCatchQueueItems,
  shouldQueueCatchSubmission,
  type OfflineCatchPayload,
} from '~/app/services/offlineCatchQueueService'

const payload: OfflineCatchPayload = {
  angler: 'Marek H.',
  bait: 'scopex boilies',
  caughtAt: '2026-05-20T18:30',
  lake: 'velky-cetin',
  lengthCm: 82,
  logbookId: 'logbook-cabin-3-may',
  pegId: 'vc-03',
  released: true,
  species: 'Kapor',
  weightKg: 10.4,
}

describe('offlineCatchQueueService', () => {
  it('creates a valid offline catch queue item with stable metadata', () => {
    const item = createOfflineCatchQueueItem(payload, {
      id: 'offline-catch-test',
      now: '2026-05-20T12:00:00.000Z',
    })

    expect(item).toMatchObject({
      attempts: 0,
      createdAt: '2026-05-20T12:00:00.000Z',
      id: 'offline-catch-test',
      payload,
      updatedAt: '2026-05-20T12:00:00.000Z',
    })
  })

  it('filters corrupt queue records and sorts valid ones oldest first', () => {
    const first = createOfflineCatchQueueItem(payload, {
      id: 'first',
      now: '2026-05-20T10:00:00.000Z',
    })
    const second = createOfflineCatchQueueItem({
      ...payload,
      angler: 'Tomáš K.',
    }, {
      id: 'second',
      now: '2026-05-20T11:00:00.000Z',
    })

    expect(sanitizeOfflineCatchQueueItems([
      { id: '', payload: {} },
      second,
      first,
      null,
    ])).toEqual([first, second])
  })

  it('queues only network-like failures and offline submissions', () => {
    expect(shouldQueueCatchSubmission(new Error('Failed to fetch'), true)).toBe(true)
    expect(shouldQueueCatchSubmission({ statusCode: 422 }, true)).toBe(false)
    expect(shouldQueueCatchSubmission({ response: { status: 500 } }, true)).toBe(false)
    expect(shouldQueueCatchSubmission({ statusCode: 422 }, false)).toBe(true)
  })

  it('extracts status and useful messages from fetch-like errors', () => {
    expect(getFetchErrorStatusCode({ data: { statusCode: 404 } })).toBe(404)
    expect(getFetchErrorStatusCode({ response: { status: 503 } })).toBe(503)
    expect(getOfflineCatchQueueErrorMessage({
      data: {
        data: {
          messages: ['Vybrané lovné miesto neexistuje.'],
        },
      },
    })).toBe('Vybrané lovné miesto neexistuje.')
  })
})
