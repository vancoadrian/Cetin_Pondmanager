import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  readLocalNotificationState,
  writeLocalNotificationState,
} from '~/server/utils/localNotificationStore'

const tempDirs: string[] = []

async function createTempStorePath() {
  const dir = await mkdtemp(join(tmpdir(), 'rybolov-notifications-'))
  tempDirs.push(dir)

  return join(dir, 'notification-state.json')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('localNotificationStore', () => {
  it('creates a seed notification store when the file is missing', async () => {
    const filePath = await createTempStorePath()
    const state = await readLocalNotificationState(filePath)

    expect(state.version).toBe(1)
    expect(state.alerts.length).toBeGreaterThan(0)
    expect(state.broadcasts).toEqual([])
    expect(state.deliveryLogs).toEqual([])
    expect(state.subscriptions).toEqual([])
  })

  it('persists alerts, broadcasts and subscriptions', async () => {
    const filePath = await createTempStorePath()

    await writeLocalNotificationState({
      alerts: [{
        body: 'Testovací oznam.',
        id: 'alert-test',
        severity: 'info',
        title: 'Info',
        validUntil: 'dnes 20:00',
      }],
      broadcasts: [{
        alertId: 'alert-test',
        body: 'Testovací oznam.',
        createdAt: '2026-05-20T12:00:00.000Z',
        createdBy: 'Správca',
        id: 'broadcast-test',
        message: 'Pripravené.',
        recipientCount: 1,
        severity: 'info',
        status: 'prepared',
        targetTopics: ['service'],
        title: 'Info',
        validUntil: 'dnes 20:00',
      }],
      deliveryLogs: [{
        attemptedAt: '2026-05-20T12:01:00.000Z',
        broadcastId: 'broadcast-test',
        deviceLabel: 'Test zariadenie',
        endpoint: 'mock://rybolov-cetin/test',
        id: 'delivery-test',
        message: 'Mock doručenie.',
        provider: 'mock',
        status: 'sent',
        subscriptionId: 'push-test',
      }],
      subscriptions: [{
        audienceRole: 'marshal',
        createdAt: '2026-05-20T12:00:00.000Z',
        deviceLabel: 'Test zariadenie',
        enabled: true,
        endpoint: 'mock://rybolov-cetin/test',
        id: 'push-test',
        lastSeenAt: '2026-05-20T12:00:00.000Z',
        marshalId: 'marshal-1',
        permission: 'granted',
        sectorIds: ['a2'],
        topics: ['service'],
        tournamentIds: ['eccj-2026'],
        updatedAt: '2026-05-20T12:00:00.000Z',
        userAgent: 'Vitest',
      }],
    }, filePath)

    const reread = await readLocalNotificationState(filePath)

    expect(reread.alerts[0]?.id).toBe('alert-test')
    expect(reread.broadcasts[0]?.id).toBe('broadcast-test')
    expect(reread.deliveryLogs[0]).toMatchObject({
      broadcastId: 'broadcast-test',
      status: 'sent',
      subscriptionId: 'push-test',
    })
    expect(reread.subscriptions[0]).toMatchObject({
      endpoint: 'mock://rybolov-cetin/test',
      enabled: true,
      marshalId: 'marshal-1',
      sectorIds: ['a2'],
      topics: ['service'],
      tournamentIds: ['eccj-2026'],
    })
  })

  it('hides legacy mock wording in stored delivery messages', async () => {
    const filePath = await createTempStorePath()
    await writeFile(filePath, JSON.stringify({
      alerts: [],
      broadcasts: [{
        alertId: 'alert-test',
        body: 'Testovací oznam.',
        createdAt: '2026-05-20T12:00:00.000Z',
        createdBy: 'Správca',
        id: 'broadcast-test',
        message: 'Mock dispatcher pripravil notifikáciu pre 1 odberov.',
        recipientCount: 1,
        severity: 'info',
        status: 'prepared',
        targetTopics: ['service'],
        title: 'Info',
        validUntil: 'dnes 20:00',
      }],
      deliveryLogs: [{
        attemptedAt: '2026-05-20T12:01:00.000Z',
        broadcastId: 'broadcast-test',
        deviceLabel: 'Test zariadenie',
        endpoint: 'mock://rybolov-cetin/test',
        id: 'delivery-test',
        message: 'Mock dispatcher označil notifikáciu ako doručenú.',
        provider: 'mock',
        status: 'sent',
        subscriptionId: 'push-test',
      }],
      subscriptions: [],
      updatedAt: '2026-05-20T12:00:00.000Z',
      version: 1,
    }), 'utf8')

    const reread = await readLocalNotificationState(filePath)
    expect(reread.broadcasts[0]?.message).toContain('Skúšobné doručovanie')
    expect(reread.deliveryLogs[0]?.message).toContain('Skúšobné doručovanie')
    expect(`${reread.broadcasts[0]?.message} ${reread.deliveryLogs[0]?.message}`).not.toContain('Mock')
  })
})
