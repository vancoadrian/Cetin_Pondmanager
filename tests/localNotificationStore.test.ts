import { mkdtemp, rm } from 'node:fs/promises'
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
      subscriptions: [{
        createdAt: '2026-05-20T12:00:00.000Z',
        deviceLabel: 'Test zariadenie',
        enabled: true,
        endpoint: 'mock://rybolov-cetin/test',
        id: 'push-test',
        lastSeenAt: '2026-05-20T12:00:00.000Z',
        permission: 'granted',
        topics: ['service'],
        updatedAt: '2026-05-20T12:00:00.000Z',
        userAgent: 'Vitest',
      }],
    }, filePath)

    const reread = await readLocalNotificationState(filePath)

    expect(reread.alerts[0]?.id).toBe('alert-test')
    expect(reread.broadcasts[0]?.id).toBe('broadcast-test')
    expect(reread.subscriptions[0]).toMatchObject({
      endpoint: 'mock://rybolov-cetin/test',
      enabled: true,
      topics: ['service'],
    })
  })
})
