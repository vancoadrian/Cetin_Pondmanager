import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CatchRecord } from '~/app/data/pond'
import { createDefaultFishRegistrySettings } from '~/app/services/fishRegistryService'
import type { LargeFishAssistanceRequest } from '~/app/services/largeFishAssistanceService'
import {
  appendLargeCatchNotificationBroadcast,
  findMatchingLargeFishAssistance,
  getLargeCatchNotificationThreshold,
} from '~/server/utils/largeCatchNotificationDispatcher'
import {
  readLocalNotificationState,
  writeLocalNotificationState,
} from '~/server/utils/localNotificationStore'

const tempDirs: string[] = []
const now = '2026-06-21T16:30:00.000Z'
const catchRecord: CatchRecord = {
  angler: 'Marek H.',
  bait: 'scopex boilies',
  caughtAt: '2026-06-21T18:25:00+02:00',
  id: 'catch-20260621-vc-03-marek-h',
  lake: 'velky-cetin',
  lengthCm: 101,
  notes: '',
  pegId: 'vc-03',
  photoLabel: 'kapor.jpg',
  released: true,
  species: 'Kapor',
  status: 'pending',
  weightKg: 21.4,
}

async function createStorePath() {
  const dir = await mkdtemp(join(tmpdir(), 'rybolov-large-catch-notification-'))
  tempDirs.push(dir)
  return join(dir, 'notification-state.json')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('large catch notification dispatcher', () => {
  it('creates an internal service broadcast for a catch above the lake threshold', async () => {
    const filePath = await createStorePath()
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

    const result = await appendLargeCatchNotificationBroadcast({
      assistanceRequests: [],
      catchRecord,
      fishRegistrySettings: createDefaultFishRegistrySettings(),
      now,
      pegLabel: 'Chata 3',
    }, filePath)
    const state = await readLocalNotificationState(filePath)

    expect(result?.broadcast).toMatchObject({
      recipientCount: 1,
      targetAudience: {
        requestId: catchRecord.id,
        roles: ['owner', 'manager'],
      },
      title: 'Veľký úlovok čaká na kontrolu',
    })
    expect(state.deliveryLogs.map((log) => log.subscriptionId)).toEqual(['push-manager'])
    expect(state.alerts).toEqual([])
  })

  it('suppresses the fallback broadcast when the same catch already called the manager', async () => {
    const request: LargeFishAssistanceRequest = {
      anglerName: catchRecord.angler,
      caughtAt: catchRecord.caughtAt,
      createdAt: now,
      id: 'fish-help-20260621-chata-3',
      lake: catchRecord.lake,
      lengthCm: catchRecord.lengthCm,
      managerPhone: '0911 298 702',
      note: '',
      pegId: catchRecord.pegId,
      pegLabel: 'Chata 3',
      phone: '+421 900 111 222',
      publicToken: 'secret',
      species: catchRecord.species,
      status: 'on-route',
      updatedAt: now,
      weightKg: catchRecord.weightKg,
    }
    const filePath = await createStorePath()

    expect(findMatchingLargeFishAssistance(catchRecord, [request])?.id).toBe(request.id)
    expect(await appendLargeCatchNotificationBroadcast({
      assistanceRequests: [request],
      catchRecord,
      fishRegistrySettings: createDefaultFishRegistrySettings(),
      now,
      pegLabel: 'Chata 3',
    }, filePath)).toBeUndefined()
  })

  it('ignores catches below a configured threshold', () => {
    expect(getLargeCatchNotificationThreshold(
      { ...catchRecord, weightKg: 17.9 },
      createDefaultFishRegistrySettings(),
    )).toBeUndefined()
  })
})
