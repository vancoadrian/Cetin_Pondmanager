import { describe, expect, it } from 'vitest'
import {
  createOfflinePlaceIssueQueueItem,
  getOfflinePlaceIssueQueueErrorMessage,
  getPlaceIssueFetchErrorStatusCode,
  sanitizeOfflinePlaceIssueQueueItems,
  shouldQueuePlaceIssueSubmission,
  type OfflinePlaceIssuePayload,
} from '~/app/services/offlinePlaceIssueQueueService'

const payload: OfflinePlaceIssuePayload = {
  category: 'lighting',
  description: 'Na chate pri mieste VC-03 nesvieti vonkajšia lampa.',
  lake: 'velky-cetin',
  photoLabel: 'lampa-vc-03.jpg',
  reporterName: 'Marek H.',
  reporterPhone: '+421 900 123 456',
  targetId: 'vc-03',
  targetType: 'peg',
  title: 'Nesvieti lampa',
}

describe('offlinePlaceIssueQueueService', () => {
  it('creates a valid offline place issue queue item', () => {
    const item = createOfflinePlaceIssueQueueItem(payload, {
      id: 'offline-place-issue-test',
      now: '2026-05-20T12:00:00.000Z',
    })

    expect(item).toMatchObject({
      attempts: 0,
      createdAt: '2026-05-20T12:00:00.000Z',
      id: 'offline-place-issue-test',
      payload,
      updatedAt: '2026-05-20T12:00:00.000Z',
    })
  })

  it('filters corrupt queue records and sorts valid issues oldest first', () => {
    const first = createOfflinePlaceIssueQueueItem(payload, {
      id: 'first',
      now: '2026-05-20T10:00:00.000Z',
    })
    const second = createOfflinePlaceIssueQueueItem({
      ...payload,
      category: 'cleanliness',
      targetId: 'facility-wc-01',
      targetType: 'facility',
      title: 'Plný kôš',
    }, {
      id: 'second',
      now: '2026-05-20T11:00:00.000Z',
    })

    expect(sanitizeOfflinePlaceIssueQueueItems([
      { id: '', payload: {} },
      second,
      first,
      undefined,
    ])).toEqual([first, second])
  })

  it('queues issue submissions only for network-like failures or offline state', () => {
    expect(shouldQueuePlaceIssueSubmission(new Error('Failed to fetch'), true)).toBe(true)
    expect(shouldQueuePlaceIssueSubmission({ statusCode: 422 }, true)).toBe(false)
    expect(shouldQueuePlaceIssueSubmission({ response: { status: 500 } }, true)).toBe(false)
    expect(shouldQueuePlaceIssueSubmission({ statusCode: 422 }, false)).toBe(true)
  })

  it('extracts status and validation messages from fetch-like errors', () => {
    expect(getPlaceIssueFetchErrorStatusCode({ data: { statusCode: 404 } })).toBe(404)
    expect(getPlaceIssueFetchErrorStatusCode({ response: { status: 503 } })).toBe(503)
    expect(getOfflinePlaceIssueQueueErrorMessage({
      data: {
        data: {
          messages: ['Vyberte konkrétne miesto alebo servisný bod.'],
        },
      },
    })).toBe('Vyberte konkrétne miesto alebo servisný bod.')
    expect(getOfflinePlaceIssueQueueErrorMessage({})).toBe('Hlásenie nedostatku sa nepodarilo odoslať z tohto zariadenia.')
  })
})
