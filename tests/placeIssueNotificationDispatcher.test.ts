import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { appendPlaceIssueNotificationBroadcast } from '~/server/utils/placeIssueNotificationDispatcher'
import { readLocalNotificationState, writeLocalNotificationState } from '~/server/utils/localNotificationStore'

const tempDirs: string[] = []

async function createStorePath() {
  const dir = await mkdtemp(join(tmpdir(), 'rybolov-place-issue-notifications-'))
  tempDirs.push(dir)

  return join(dir, 'notification-state.json')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('placeIssueNotificationDispatcher', () => {
  it('creates a service broadcast for internal operations subscriptions only', async () => {
    const filePath = await createStorePath()

    await writeLocalNotificationState(
      {
        alerts: [],
        broadcasts: [],
        deliveryLogs: [],
        subscriptions: [
          {
            audienceRole: 'manager',
            createdAt: '2026-05-20T12:00:00.000Z',
            deviceLabel: 'Správca - mobil',
            enabled: true,
            endpoint: 'mock://rybolov-cetin/manager',
            id: 'push-manager',
            lastSeenAt: '2026-05-20T12:00:00.000Z',
            permission: 'granted',
            topics: ['service'],
            updatedAt: '2026-05-20T12:00:00.000Z',
            userAgent: 'Vitest',
          },
          {
            audienceRole: 'worker',
            createdAt: '2026-05-20T12:00:00.000Z',
            deviceLabel: 'Brigádnik - mobil',
            enabled: true,
            endpoint: 'mock://rybolov-cetin/worker',
            id: 'push-worker',
            lastSeenAt: '2026-05-20T12:00:00.000Z',
            permission: 'granted',
            topics: ['service'],
            updatedAt: '2026-05-20T12:00:00.000Z',
            userAgent: 'Vitest',
          },
          {
            createdAt: '2026-05-20T12:00:00.000Z',
            deviceLabel: 'Verejný odber prevádzky',
            enabled: true,
            endpoint: 'mock://rybolov-cetin/public-service',
            id: 'push-public-service',
            lastSeenAt: '2026-05-20T12:00:00.000Z',
            permission: 'granted',
            topics: ['service'],
            updatedAt: '2026-05-20T12:00:00.000Z',
            userAgent: 'Vitest',
          },
        ],
      },
      filePath,
    )

    const result = await appendPlaceIssueNotificationBroadcast(
      {
        issue: {
          category: 'safety',
          description: 'Pri móle je uvoľnená doska a môže sa na nej niekto zraniť.',
          id: 'issue-20260520-chata-3-uvolnena-doska',
          priority: 'urgent',
          targetLabel: 'Chata 3',
          title: 'Uvoľnená doska na móle',
        },
        now: '2026-05-20T13:00:00.000Z',
      },
      filePath,
    )
    const state = await readLocalNotificationState(filePath)

    expect(result?.broadcast).toMatchObject({
      recipientCount: 2,
      severity: 'service',
      status: 'sent',
      targetAudience: {
        requestId: 'issue-20260520-chata-3-uvolnena-doska',
        roles: ['owner', 'manager', 'worker'],
      },
      targetTopics: ['service'],
      title: 'Urgentný nedostatok: Uvoľnená doska na móle',
    })
    expect(state.deliveryLogs.map((log) => log.subscriptionId).sort()).toEqual([
      'push-manager',
      'push-worker',
    ])
    expect(state.alerts[0]?.body).toContain('Chata 3')
  })
})
