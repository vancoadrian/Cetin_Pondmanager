import { describe, expect, it } from 'vitest'
import {
  createEmptyNotificationState,
  createNotificationBroadcast,
  disablePushSubscription,
  savePushSubscription,
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
})
