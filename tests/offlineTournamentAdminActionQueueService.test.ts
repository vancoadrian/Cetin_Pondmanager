import { describe, expect, it } from 'vitest'
import {
  createOfflineTournamentAdminActionQueueItem,
  getOfflineTournamentAdminActionQueueErrorMessage,
  getTournamentAdminActionFetchErrorStatusCode,
  sanitizeOfflineTournamentAdminActionQueueItems,
  shouldQueueTournamentAdminActionSubmission,
  withTournamentAdminActionClientMutationId,
  type OfflineTournamentAdminActionPayload,
} from '~/app/services/offlineTournamentAdminActionQueueService'

const catchPayload: OfflineTournamentAdminActionPayload = {
  kind: 'catch-verification',
  payload: {
    catchId: 'tc-1',
    status: 'verified',
  },
}

const penaltyPayload: OfflineTournamentAdminActionPayload = {
  kind: 'penalty',
  payload: {
    durationHours: 2,
    marshalId: 'marshal-1',
    reason: 'Tím prekročil vyznačený limit sektora.',
    rodsLess: 1,
    sectorId: 'b4',
    tournamentId: 'spring-carp-cup-2026',
    type: 'rod-reduction',
  },
}

const requestActionPayload: OfflineTournamentAdminActionPayload = {
  kind: 'request-action',
  payload: {
    action: 'assign',
    marshalId: 'marshal-1',
    requestId: 'tr-1001',
  },
}

describe('offlineTournamentAdminActionQueueService', () => {
  it('creates a valid offline admin tournament action queue item', () => {
    const item = createOfflineTournamentAdminActionQueueItem(catchPayload, {
      id: 'offline-admin-action-test',
      now: '2026-05-20T12:00:00.000Z',
    })

    expect(item).toMatchObject({
      attempts: 0,
      createdAt: '2026-05-20T12:00:00.000Z',
      id: 'offline-admin-action-test',
      payload: {
        kind: 'catch-verification',
        payload: {
          catchId: 'tc-1',
          clientMutationId: 'offline-admin-action-test',
          status: 'verified',
        },
      },
      updatedAt: '2026-05-20T12:00:00.000Z',
    })
  })

  it('creates a valid offline request action queue item', () => {
    const item = createOfflineTournamentAdminActionQueueItem(requestActionPayload, {
      id: 'offline-admin-request-action-1',
      now: '2026-05-20T12:05:00.000Z',
    })

    expect(item).toMatchObject({
      id: 'offline-admin-request-action-1',
      payload: {
        kind: 'request-action',
        payload: {
          action: 'assign',
          clientMutationId: 'offline-admin-request-action-1',
          marshalId: 'marshal-1',
          requestId: 'tr-1001',
        },
      },
    })
  })

  it('adds and preserves client mutation ids for retry-safe admin actions', () => {
    const prepared = withTournamentAdminActionClientMutationId(penaltyPayload, {
      id: 'offline-admin-penalty-1',
      now: '2026-05-20T12:30:00.000Z',
    })
    const replayPrepared = withTournamentAdminActionClientMutationId(prepared, {
      id: 'different-queue-id',
      now: '2026-05-20T12:31:00.000Z',
    })

    expect(prepared.payload.clientMutationId).toBe('offline-admin-penalty-1')
    expect(replayPrepared.payload.clientMutationId).toBe('offline-admin-penalty-1')
  })

  it('drops corrupt queue records and keeps valid admin actions ordered by creation time', () => {
    const first = createOfflineTournamentAdminActionQueueItem(catchPayload, {
      id: 'first',
      now: '2026-05-20T10:00:00.000Z',
    })
    const second = createOfflineTournamentAdminActionQueueItem(penaltyPayload, {
      id: 'second',
      now: '2026-05-20T11:00:00.000Z',
    })

    expect(sanitizeOfflineTournamentAdminActionQueueItems([
      second,
      { id: 'broken', payload: { kind: 'penalty', payload: { type: 'warning' } } },
      first,
      undefined,
    ])).toEqual([first, second])
  })

  it('queues admin tournament actions only for network-like failures or offline state', () => {
    expect(shouldQueueTournamentAdminActionSubmission(new Error('Failed to fetch'), true)).toBe(true)
    expect(shouldQueueTournamentAdminActionSubmission({ statusCode: 422 }, true)).toBe(false)
    expect(shouldQueueTournamentAdminActionSubmission({ response: { status: 500 } }, true)).toBe(false)
    expect(shouldQueueTournamentAdminActionSubmission({ statusCode: 422 }, false)).toBe(true)
  })

  it('extracts status and validation messages from fetch-like errors', () => {
    expect(getTournamentAdminActionFetchErrorStatusCode({ data: { statusCode: 404 } })).toBe(404)
    expect(getTournamentAdminActionFetchErrorStatusCode({ response: { status: 503 } })).toBe(503)
    expect(getOfflineTournamentAdminActionQueueErrorMessage({
      data: {
        data: {
          messages: ['Vybraný kontrolór nemá priradený tento sektor.'],
        },
      },
    })).toBe('Vybraný kontrolór nemá priradený tento sektor.')
    expect(getOfflineTournamentAdminActionQueueErrorMessage({})).toBe('Kontrolórsky súťažný úkon sa nepodarilo odoslať z tohto zariadenia.')
  })
})
