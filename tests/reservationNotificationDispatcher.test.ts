import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { appendReservationRequestNotificationBroadcast } from '~/server/utils/reservationNotificationDispatcher'
import { readLocalNotificationState, writeLocalNotificationState } from '~/server/utils/localNotificationStore'

const tempDirs: string[] = []

async function createStorePath() {
  const dir = await mkdtemp(join(tmpdir(), 'rybolov-reservation-notifications-'))
  tempDirs.push(dir)

  return join(dir, 'notification-state.json')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('reservationNotificationDispatcher', () => {
  it('creates an internal reservations broadcast for operations roles only', async () => {
    const filePath = await createStorePath()
    const now = '2026-06-10T08:00:00.000Z'

    await writeLocalNotificationState({
      alerts: [],
      broadcasts: [],
      deliveryLogs: [],
      subscriptions: [
        {
          audienceRole: 'manager',
          createdAt: now,
          deviceLabel: 'Správca - mobil',
          enabled: true,
          endpoint: 'mock://rybolov-cetin/manager-reservations',
          id: 'push-manager-reservations',
          lastSeenAt: now,
          permission: 'granted',
          topics: ['reservations'],
          updatedAt: now,
          userAgent: 'Vitest',
        },
        {
          audienceRole: 'worker',
          createdAt: now,
          deviceLabel: 'Brigádnik - mobil',
          enabled: true,
          endpoint: 'mock://rybolov-cetin/worker-reservations',
          id: 'push-worker-reservations',
          lastSeenAt: now,
          permission: 'granted',
          topics: ['reservations'],
          updatedAt: now,
          userAgent: 'Vitest',
        },
        {
          createdAt: now,
          deviceLabel: 'Verejný odber rezervácií',
          enabled: true,
          endpoint: 'mock://rybolov-cetin/public-reservations',
          id: 'push-public-reservations',
          lastSeenAt: now,
          permission: 'granted',
          topics: ['reservations'],
          updatedAt: now,
          userAgent: 'Vitest',
        },
      ],
    }, filePath)

    const result = await appendReservationRequestNotificationBroadcast({
      lakeName: 'Veľký Cetín',
      now,
      pegLabel: 'Chata 3',
      reservation: {
        contactPhone: '+421 900 123 999',
        extraIds: ['wood-crate'],
        from: '2026-06-10',
        guest: 'Ján Route',
        id: 'req-20260610-vc-03-3999',
        rentalIds: ['landing-net-rental', 'fish-cradle-rental'],
        to: '2026-06-12',
      },
    }, filePath)
    const state = await readLocalNotificationState(filePath)

    expect(result?.broadcast).toMatchObject({
      recipientCount: 2,
      severity: 'info',
      status: 'sent',
      targetAudience: {
        requestId: 'req-20260610-vc-03-3999',
        roles: ['owner', 'manager', 'worker'],
      },
      targetTopics: ['reservations'],
      title: 'Nová rezervácia: Ján Route',
    })
    expect(state.alerts).toEqual([])
    expect(state.deliveryLogs.map((log) => log.subscriptionId).sort()).toEqual([
      'push-manager-reservations',
      'push-worker-reservations',
    ])
  })
})
