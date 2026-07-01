import { describe, expect, it } from 'vitest'
import {
  createOfflineReservationQueueItem,
  getOfflineReservationQueueErrorMessage,
  getReservationFetchErrorStatusCode,
  sanitizeOfflineReservationQueueItems,
  shouldQueueReservationSubmission,
  type OfflineReservationPayload,
} from '~/app/services/offlineReservationQueueService'

const payload: OfflineReservationPayload = {
  cabinProductId: 'large-cabin',
  contactEmail: 'marek@example.com',
  contactName: 'Marek H.',
  contactPhone: '+421 900 123 456',
  dateFrom: '2026-05-20',
  dateTo: '2026-05-22',
  extraIds: ['firewood-crate'],
  lake: 'velky-cetin',
  pegId: 'vc-03',
  permitId: 'permit-48h',
  rentalIds: ['landing-net'],
}

describe('offlineReservationQueueService', () => {
  it('creates a valid offline reservation queue item', () => {
    const item = createOfflineReservationQueueItem(payload, {
      id: 'offline-reservation-test',
      now: '2026-05-20T12:00:00.000Z',
    })

    expect(item).toMatchObject({
      attempts: 0,
      createdAt: '2026-05-20T12:00:00.000Z',
      id: 'offline-reservation-test',
      payload,
      updatedAt: '2026-05-20T12:00:00.000Z',
    })
  })

  it('filters corrupt queue records and sorts valid reservations oldest first', () => {
    const first = createOfflineReservationQueueItem(payload, {
      id: 'first',
      now: '2026-05-20T10:00:00.000Z',
    })
    const second = createOfflineReservationQueueItem({
      ...payload,
      contactName: 'Tomáš K.',
      pegId: 'vc-04',
    }, {
      id: 'second',
      now: '2026-05-20T11:00:00.000Z',
    })

    expect(sanitizeOfflineReservationQueueItems([
      { id: 'broken', payload: { contactName: 'x' } },
      second,
      first,
      false,
    ])).toEqual([first, second])
  })

  it('queues reservation submissions only for network-like failures or offline state', () => {
    expect(shouldQueueReservationSubmission(new Error('Failed to fetch'), true)).toBe(true)
    expect(shouldQueueReservationSubmission({ statusCode: 422 }, true)).toBe(false)
    expect(shouldQueueReservationSubmission({ response: { status: 500 } }, true)).toBe(false)
    expect(shouldQueueReservationSubmission({ statusCode: 422 }, false)).toBe(true)
  })

  it('extracts status and validation messages from fetch-like errors', () => {
    expect(getReservationFetchErrorStatusCode({ data: { statusCode: 404 } })).toBe(404)
    expect(getReservationFetchErrorStatusCode({ response: { status: 503 } })).toBe(503)
    expect(getOfflineReservationQueueErrorMessage({
      data: {
        data: {
          messages: ['Vybrané lovné miesto neexistuje pre zvolené jazero.'],
        },
      },
    })).toBe('Vybrané lovné miesto neexistuje pre zvolené jazero.')
    expect(getOfflineReservationQueueErrorMessage({})).toBe('Rezerváciu sa nepodarilo odoslať z tohto zariadenia.')
  })
})
