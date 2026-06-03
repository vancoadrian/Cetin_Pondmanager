import { describe, expect, it } from 'vitest'
import {
  createEmptyNotificationState,
  createNotificationBroadcast,
  disablePushSubscription,
  runNotificationDelivery,
  savePushSubscription,
  stripPushSubscriptionAudienceScope,
  type NotificationState,
} from '~/app/services/notificationService'

const now = '2026-05-20T12:00:00.000Z'

describe('notificationService', () => {
  it('creates a push subscription and enables it only when permission is granted', () => {
    const result = savePushSubscription({
      auth: 'auth-key',
      deviceLabel: 'iPhone pri vode',
      endpoint: 'mock://rybolov-cetin/device-1',
      p256dh: 'p256dh-key',
      permission: 'granted',
      topics: ['weather', 'service', 'weather'],
      userAgent: 'Safari PWA',
    }, createEmptyNotificationState(), now)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Subscription should be valid.')

    expect(result.statusCode).toBe(201)
    expect(result.subscription).toMatchObject({
      deviceLabel: 'iPhone pri vode',
      enabled: true,
      endpoint: 'mock://rybolov-cetin/device-1',
      permission: 'granted',
      topics: ['weather', 'service'],
    })
    expect(result.subscriptions).toHaveLength(1)
  })

  it('updates an existing subscription by endpoint', () => {
    const created = savePushSubscription({
      endpoint: 'mock://rybolov-cetin/device-1',
      permission: 'granted',
      topics: ['weather'],
    }, createEmptyNotificationState(), now)
    if (!created.ok) throw new Error('Subscription should be valid.')
    const state: NotificationState = {
      alerts: [],
      broadcasts: [],
      deliveryLogs: [],
      subscriptions: created.subscriptions,
    }
    const updated = savePushSubscription({
      deviceLabel: 'Tablet v chate',
      endpoint: 'mock://rybolov-cetin/device-1',
      permission: 'granted',
      topics: ['reservations', 'service'],
    }, state, '2026-05-20T13:00:00.000Z')

    expect(updated.ok).toBe(true)
    if (!updated.ok) throw new Error('Subscription update should be valid.')

    expect(updated.statusCode).toBe(200)
    expect(updated.subscription.id).toBe(created.subscription.id)
    expect(updated.subscription.deviceLabel).toBe('Tablet v chate')
    expect(updated.subscription.topics).toEqual(['reservations', 'service'])
    expect(updated.subscriptions).toHaveLength(1)
  })

  it('stores internal role and sector scope for admin-created subscriptions', () => {
    const result = savePushSubscription({
      audienceRole: 'marshal',
      deviceLabel: 'Kontrolór Peter H. - mobil',
      endpoint: 'mock://rybolov-cetin/internal/marshal/eccj-2026/marshal-1/a1-a2-a3',
      marshalId: 'marshal-1',
      permission: 'granted',
      sectorIds: ['a1', 'a2', 'a2', 'a3'],
      topics: ['tournaments', 'service'],
      tournamentIds: ['eccj-2026'],
      userAgent: 'Rybolov Cetín admin mock',
    }, createEmptyNotificationState(), now)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Internal subscription should be valid.')

    expect(result.subscription).toMatchObject({
      audienceRole: 'marshal',
      deviceLabel: 'Kontrolór Peter H. - mobil',
      enabled: true,
      marshalId: 'marshal-1',
      permission: 'granted',
      sectorIds: ['a1', 'a2', 'a3'],
      topics: ['tournaments', 'service'],
      tournamentIds: ['eccj-2026'],
    })
  })

  it('strips internal audience scope from public push subscription input', () => {
    const stripped = stripPushSubscriptionAudienceScope({
      audienceRole: 'marshal',
      endpoint: 'mock://rybolov-cetin/public-device',
      marshalId: 'marshal-1',
      permission: 'granted',
      sectorIds: ['a2'],
      topics: ['weather', 'tournaments'],
      tournamentIds: ['eccj-2026'],
    })
    const result = savePushSubscription(stripped, createEmptyNotificationState(), now)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Public subscription should stay valid.')

    expect(result.subscription.audienceRole).toBeUndefined()
    expect(result.subscription.marshalId).toBeUndefined()
    expect(result.subscription.sectorIds).toEqual([])
    expect(result.subscription.tournamentIds).toEqual([])
    expect(result.subscription.topics).toEqual(['weather', 'tournaments'])
  })

  it('disables a stored subscription', () => {
    const created = savePushSubscription({
      endpoint: 'mock://rybolov-cetin/device-2',
      permission: 'granted',
      topics: ['weather'],
    }, createEmptyNotificationState(), now)
    if (!created.ok) throw new Error('Subscription should be valid.')
    const result = disablePushSubscription({
      endpoint: 'mock://rybolov-cetin/device-2',
    }, {
      alerts: [],
      broadcasts: [],
      deliveryLogs: [],
      subscriptions: created.subscriptions,
    }, '2026-05-20T13:00:00.000Z')

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Unsubscribe should be valid.')

    expect(result.subscription).toMatchObject({
      enabled: false,
      permission: 'denied',
    })
    expect(result.subscriptions[0]?.enabled).toBe(false)
  })

  it('creates a public alert and broadcast for matching enabled subscriptions', () => {
    const weatherSubscription = savePushSubscription({
      endpoint: 'mock://rybolov-cetin/weather-device',
      permission: 'granted',
      topics: ['weather'],
    }, createEmptyNotificationState(), now)
    if (!weatherSubscription.ok) throw new Error('Subscription should be valid.')
    const disabledSubscription = savePushSubscription({
      endpoint: 'mock://rybolov-cetin/disabled-device',
      permission: 'denied',
      topics: ['weather'],
    }, {
      alerts: [],
      broadcasts: [],
      deliveryLogs: [],
      subscriptions: weatherSubscription.subscriptions,
    }, now)
    if (!disabledSubscription.ok) throw new Error('Subscription should be valid.')
    const result = createNotificationBroadcast({
      body: 'O 18:30 sa očakáva prechod búrkového pásma, skontrolujte bivaky.',
      severity: 'storm',
      targetTopics: ['weather', 'service'],
      title: 'Výstraha pred búrkou',
      validUntil: 'dnes 21:00',
    }, {
      alerts: [],
      broadcasts: [],
      deliveryLogs: [],
      subscriptions: disabledSubscription.subscriptions,
    }, 'Správca', now)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Broadcast should be valid.')

    expect(result.alert.title).toBe('Výstraha pred búrkou')
    expect(result.broadcast).toMatchObject({
      recipientCount: 1,
      severity: 'storm',
      status: 'prepared',
      targetTopics: ['weather', 'service'],
    })
    expect(result.alerts).toHaveLength(1)
    expect(result.broadcasts).toHaveLength(1)
  })

  it('targets tournament broadcasts by internal role, tournament and marshal scope', () => {
    const state: NotificationState = {
      alerts: [],
      broadcasts: [],
      deliveryLogs: [],
      subscriptions: [
        {
          audienceRole: 'tournament_organizer',
          createdAt: now,
          deviceLabel: 'Organizátor',
          enabled: true,
          endpoint: 'mock://rybolov-cetin/organizer',
          id: 'push-organizer',
          lastSeenAt: now,
          permission: 'granted',
          topics: ['tournaments'],
          tournamentIds: ['eccj-2026'],
          updatedAt: now,
          userAgent: 'Vitest',
        },
        {
          audienceRole: 'marshal',
          createdAt: now,
          deviceLabel: 'Kontrolór A2',
          enabled: true,
          endpoint: 'mock://rybolov-cetin/marshal-a2',
          id: 'push-marshal-a2',
          lastSeenAt: now,
          marshalId: 'marshal-1',
          permission: 'granted',
          sectorIds: ['a2'],
          topics: ['tournaments'],
          tournamentIds: ['eccj-2026'],
          updatedAt: now,
          userAgent: 'Vitest',
        },
        {
          audienceRole: 'marshal',
          createdAt: now,
          deviceLabel: 'Kontrolór B4',
          enabled: true,
          endpoint: 'mock://rybolov-cetin/marshal-b4',
          id: 'push-marshal-b4',
          lastSeenAt: now,
          marshalId: 'marshal-2',
          permission: 'granted',
          sectorIds: ['b4'],
          topics: ['tournaments'],
          tournamentIds: ['eccj-2026'],
          updatedAt: now,
          userAgent: 'Vitest',
        },
      ],
    }
    const result = createNotificationBroadcast({
      body: 'Sektor A2 žiada kontrolóra k váženiu úlovku.',
      severity: 'info',
      targetAudience: {
        marshalIds: ['marshal-1'],
        reason: 'privolanie kontrolóra',
        roles: ['tournament_organizer', 'marshal'],
        sectorIds: ['a2'],
        tournamentId: 'eccj-2026',
      },
      targetTopics: ['tournaments'],
      title: 'Tím žiada kontrolóra',
      validUntil: 'dnes 23:59',
    }, state, 'Súťažný dispečing', now)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Tournament broadcast should be valid.')

    expect(result.broadcast.recipientCount).toBe(2)
    expect(result.broadcast.targetAudience).toMatchObject({
      marshalIds: ['marshal-1'],
      roles: ['tournament_organizer', 'marshal'],
      sectorIds: ['a2'],
      tournamentId: 'eccj-2026',
    })
  })

  it('creates delivery logs and marks mock delivery as sent', () => {
    const subscription = savePushSubscription({
      endpoint: 'mock://rybolov-cetin/weather-device',
      permission: 'granted',
      topics: ['weather'],
    }, createEmptyNotificationState(), now)
    if (!subscription.ok) throw new Error('Subscription should be valid.')
    const state: NotificationState = {
      alerts: [],
      broadcasts: [],
      deliveryLogs: [],
      subscriptions: subscription.subscriptions,
    }
    const broadcast = createNotificationBroadcast({
      body: 'O 18:30 sa očakáva prechod búrkového pásma, skontrolujte bivaky.',
      severity: 'storm',
      targetTopics: ['weather'],
      title: 'Výstraha pred búrkou',
      validUntil: 'dnes 21:00',
    }, state, 'Správca', now)
    if (!broadcast.ok) throw new Error('Broadcast should be valid.')

    const delivery = runNotificationDelivery(broadcast.broadcast, state, {
      now,
      provider: 'mock',
    })

    expect(delivery.broadcast).toMatchObject({
      message: 'Mock dispatcher zaevidoval 1 doručení.',
      recipientCount: 1,
      status: 'sent',
    })
    expect(delivery.deliveryLogs).toHaveLength(1)
    expect(delivery.deliveryLogs[0]).toMatchObject({
      broadcastId: broadcast.broadcast.id,
      provider: 'mock',
      status: 'sent',
      subscriptionId: subscription.subscription.id,
    })
  })

  it('marks web push delivery as failed when VAPID config is missing', () => {
    const subscription = savePushSubscription({
      endpoint: 'https://push.example.test/device-1',
      permission: 'granted',
      topics: ['service'],
    }, createEmptyNotificationState(), now)
    if (!subscription.ok) throw new Error('Subscription should be valid.')
    const state: NotificationState = {
      alerts: [],
      broadcasts: [],
      deliveryLogs: [],
      subscriptions: subscription.subscriptions,
    }
    const broadcast = createNotificationBroadcast({
      body: 'Servisný oznam pre rybárov pri vode.',
      severity: 'service',
      targetTopics: ['service'],
      title: 'Servisný oznam',
      validUntil: 'dnes 21:00',
    }, state, 'Správca', now)
    if (!broadcast.ok) throw new Error('Broadcast should be valid.')

    const delivery = runNotificationDelivery(broadcast.broadcast, state, {
      hasVapidConfig: false,
      now,
      provider: 'web-push',
    })

    expect(delivery.broadcast.status).toBe('failed')
    expect(delivery.deliveryLogs[0]).toMatchObject({
      message: 'Web Push provider nemá kompletné VAPID nastavenie.',
      provider: 'web-push',
      status: 'failed',
    })
  })
})
