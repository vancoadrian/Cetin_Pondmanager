import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { LargeFishAssistanceRequest } from '~/app/services/largeFishAssistanceService'
import { appendLargeFishAssistanceNotification } from '~/server/utils/largeFishAssistanceNotificationDispatcher'
import { readLocalNotificationState, writeLocalNotificationState } from '~/server/utils/localNotificationStore'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('large fish assistance notification dispatcher', () => {
  it('sends an internal service push to managers without publishing a public alert', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rybolov-large-fish-notification-'))
    tempDirs.push(dir)
    const filePath = join(dir, 'notification-state.json')
    const now = '2026-06-22T12:10:00.000Z'

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
          endpoint: 'mock://manager-device',
          id: 'push-manager',
          lastSeenAt: now,
          permission: 'granted',
          topics: ['service'],
          updatedAt: now,
          userAgent: 'Vitest',
        },
        {
          createdAt: now,
          deviceLabel: 'Verejný odber',
          enabled: true,
          endpoint: 'mock://public-device',
          id: 'push-public',
          lastSeenAt: now,
          permission: 'granted',
          topics: ['service'],
          updatedAt: now,
          userAgent: 'Vitest',
        },
      ],
    }, filePath)

    const request: LargeFishAssistanceRequest = {
      anglerName: 'Marek H.',
      caughtAt: now,
      createdAt: now,
      id: 'fish-help-20260622-chata-3',
      lake: 'velky-cetin',
      lengthCm: 101,
      managerPhone: '0911 298 702',
      note: '',
      pegId: 'vc-03',
      pegLabel: 'Chata 3',
      phone: '+421 900 111 222',
      publicToken: 'secret-token',
      species: 'Kapor',
      status: 'waiting',
      updatedAt: now,
      weightKg: 21.4,
    }
    const result = await appendLargeFishAssistanceNotification(request, filePath)
    const state = await readLocalNotificationState(filePath)

    expect(result?.broadcast).toMatchObject({
      recipientCount: 1,
      targetAudience: {
        requestId: request.id,
        roles: ['owner', 'manager'],
      },
      title: 'Veľká ryba: správca potrebný',
    })
    expect(state.deliveryLogs.map((log) => log.subscriptionId)).toEqual(['push-manager'])
    expect(state.alerts).toEqual([])
  })
})
