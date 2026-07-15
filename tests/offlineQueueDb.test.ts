import { describe, expect, it } from 'vitest'
import {
  isOfflineQueueRecord,
  OFFLINE_QUEUE_STORES,
} from '~/app/services/offlineQueueDb'

const envelope = {
  attempts: 0,
  createdAt: '2026-07-14T10:00:00.000Z',
  id: 'offline-reservation-test',
  updatedAt: '2026-07-14T10:00:00.000Z',
}

describe('offline queue summary integrity', () => {
  it('counts a structurally valid reservation queue record', () => {
    expect(isOfflineQueueRecord(OFFLINE_QUEUE_STORES.reservations, {
      ...envelope,
      payload: {
        contactName: 'Marek H.',
        contactPhone: '+421 900 123 456',
        dateFrom: '2026-07-15',
        dateTo: '2026-07-17',
        extraIds: [],
        lake: 'velky-cetin',
        pegId: 'vc-03',
        permitId: 'permit-48h',
        rentalIds: [],
      },
    })).toBe(true)
  })

  it('does not count corrupt records that queue readers cannot display', () => {
    expect(isOfflineQueueRecord(OFFLINE_QUEUE_STORES.reservations, {
      id: 'broken',
      payload: { contactName: 'x' },
    })).toBe(false)
    expect(isOfflineQueueRecord(OFFLINE_QUEUE_STORES.reservations, {
      ...envelope,
      payload: { contactName: 'x' },
    })).toBe(false)
  })
})
