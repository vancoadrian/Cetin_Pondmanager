import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { appendTournamentNotificationBroadcast } from '~/server/utils/tournamentNotificationDispatcher'
import { readLocalNotificationState, writeLocalNotificationState } from '~/server/utils/localNotificationStore'

const tempDirs: string[] = []

async function createStorePath() {
  const dir = await mkdtemp(join(tmpdir(), 'rybolov-tournament-notifications-'))
  tempDirs.push(dir)

  return join(dir, 'notification-state.json')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('tournamentNotificationDispatcher', () => {
  it('creates a tournament broadcast for subscriptions interested in competitions', async () => {
    const filePath = await createStorePath()

    await writeLocalNotificationState(
      {
        alerts: [],
        broadcasts: [],
        deliveryLogs: [],
        subscriptions: [
          {
            createdAt: '2026-05-20T12:00:00.000Z',
            deviceLabel: 'Kontrolór pri vode',
            enabled: true,
            endpoint: 'mock://rybolov-cetin/marshal',
            id: 'push-marshal',
            lastSeenAt: '2026-05-20T12:00:00.000Z',
            permission: 'granted',
            topics: ['tournaments'],
            updatedAt: '2026-05-20T12:00:00.000Z',
            userAgent: 'Vitest',
          },
          {
            createdAt: '2026-05-20T12:00:00.000Z',
            deviceLabel: 'Počasie',
            enabled: true,
            endpoint: 'mock://rybolov-cetin/weather',
            id: 'push-weather',
            lastSeenAt: '2026-05-20T12:00:00.000Z',
            permission: 'granted',
            topics: ['weather'],
            updatedAt: '2026-05-20T12:00:00.000Z',
            userAgent: 'Vitest',
          },
        ],
      },
      filePath,
    )

    const result = await appendTournamentNotificationBroadcast(
      {
        body: 'Sektor A2 žiada príchod kontrolóra k meraniu úlovku.',
        createdBy: 'Organizátor',
        now: '2026-05-20T13:00:00.000Z',
        title: 'Tím žiada kontrolóra',
      },
      filePath,
    )
    const state = await readLocalNotificationState(filePath)

    expect(result?.broadcast).toMatchObject({
      recipientCount: 1,
      status: 'sent',
      targetTopics: ['tournaments'],
      title: 'Tím žiada kontrolóra',
    })
    expect(state.broadcasts[0]?.id).toBe(result?.broadcast.id)
    expect(state.deliveryLogs[0]).toMatchObject({
      broadcastId: result?.broadcast.id,
      provider: 'mock',
      status: 'sent',
      subscriptionId: 'push-marshal',
    })
    expect(state.alerts[0]?.title).toBe('Tím žiada kontrolóra')
  })

  it('stores internal tournament audience for assigned marshal notifications', async () => {
    const filePath = await createStorePath()

    await writeLocalNotificationState(
      {
        alerts: [],
        broadcasts: [],
        deliveryLogs: [],
        subscriptions: [
          {
            audienceRole: 'marshal',
            createdAt: '2026-05-20T12:00:00.000Z',
            deviceLabel: 'Kontrolór A2',
            enabled: true,
            endpoint: 'mock://rybolov-cetin/marshal-a2',
            id: 'push-marshal-a2',
            lastSeenAt: '2026-05-20T12:00:00.000Z',
            marshalId: 'marshal-1',
            permission: 'granted',
            sectorIds: ['a2'],
            topics: ['tournaments'],
            tournamentIds: ['eccj-2026'],
            updatedAt: '2026-05-20T12:00:00.000Z',
            userAgent: 'Vitest',
          },
          {
            audienceRole: 'marshal',
            createdAt: '2026-05-20T12:00:00.000Z',
            deviceLabel: 'Kontrolór B4',
            enabled: true,
            endpoint: 'mock://rybolov-cetin/marshal-b4',
            id: 'push-marshal-b4',
            lastSeenAt: '2026-05-20T12:00:00.000Z',
            marshalId: 'marshal-2',
            permission: 'granted',
            sectorIds: ['b4'],
            topics: ['tournaments'],
            tournamentIds: ['eccj-2026'],
            updatedAt: '2026-05-20T12:00:00.000Z',
            userAgent: 'Vitest',
          },
        ],
      },
      filePath,
    )

    const result = await appendTournamentNotificationBroadcast(
      {
        body: 'Kontrolór A2 má nové hlásenie v sektore A2.',
        marshalIds: ['marshal-1'],
        now: '2026-05-20T13:05:00.000Z',
        reason: 'priradené hlásenie',
        requestId: 'tr-202605201305-a2-catch-measurement',
        roles: ['marshal'],
        sectorIds: ['a2'],
        title: 'Kontrolór priradený',
        tournamentId: 'eccj-2026',
      },
      filePath,
    )
    const state = await readLocalNotificationState(filePath)

    expect(result?.broadcast).toMatchObject({
      recipientCount: 1,
      status: 'sent',
      targetAudience: {
        marshalIds: ['marshal-1'],
        reason: 'priradené hlásenie',
        requestId: 'tr-202605201305-a2-catch-measurement',
        roles: ['marshal'],
        sectorIds: ['a2'],
        tournamentId: 'eccj-2026',
      },
      title: 'Kontrolór priradený',
    })
    expect(state.broadcasts[0]?.targetAudience?.marshalIds).toEqual(['marshal-1'])
    expect(state.deliveryLogs[0]).toMatchObject({
      provider: 'mock',
      status: 'sent',
      subscriptionId: 'push-marshal-a2',
    })
  })
})
