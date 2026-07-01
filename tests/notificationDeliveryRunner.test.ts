import { describe, expect, it } from 'vitest'
import {
  createNotificationBroadcast,
  savePushSubscription,
  type NotificationState,
} from '~/app/services/notificationService'
import { runServerNotificationDelivery, type WebPushSender } from '~/server/utils/notificationDeliveryRunner'

const now = '2026-05-20T12:00:00.000Z'

describe('notificationDeliveryRunner', () => {
  it('sends real Web Push subscriptions through the injected sender', async () => {
    const subscription = savePushSubscription({
      auth: 'auth-secret',
      endpoint: 'https://push.example.test/device-1',
      p256dh: 'p256dh-key',
      permission: 'granted',
      topics: ['weather'],
    }, {
      alerts: [],
      broadcasts: [],
      deliveryLogs: [],
      subscriptions: [],
    }, now)
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
    const sends: Array<{ endpoint: string, payload: unknown }> = []
    const sendWebPush: WebPushSender = async (pushSubscription, payload) => {
      sends.push({
        endpoint: pushSubscription.endpoint,
        payload: JSON.parse(payload),
      })

      return { statusCode: 201 }
    }

    const result = await runServerNotificationDelivery(broadcast.broadcast, state, {
      hasVapidConfig: true,
      now,
      provider: 'web-push',
      sendWebPush,
      subject: 'mailto:spravca@example.test',
      vapidPrivateKey: 'private-key',
      vapidPublicKey: 'public-key',
    })

    expect(sends).toHaveLength(1)
    expect(sends[0]).toMatchObject({
      endpoint: 'https://push.example.test/device-1',
      payload: {
        title: 'Výstraha pred búrkou',
        url: '/notifikacie',
      },
    })
    expect(result.broadcast).toMatchObject({
      message: 'Web Push odoslaný pre 1 odberov.',
      status: 'sent',
    })
    expect(result.deliveryLogs[0]).toMatchObject({
      message: 'Web Push odoslaný, push služba vrátila HTTP 201.',
      provider: 'web-push',
      status: 'sent',
    })
  })

  it('keeps mock endpoints prepared and does not call the Web Push sender', async () => {
    const subscription = savePushSubscription({
      auth: 'mock-auth',
      endpoint: 'mock://rybolov-cetin/internal/marshal/eccj-2026/marshal-1/a1',
      p256dh: 'mock-p256dh',
      permission: 'granted',
      topics: ['tournaments'],
    }, {
      alerts: [],
      broadcasts: [],
      deliveryLogs: [],
      subscriptions: [],
    }, now)
    if (!subscription.ok) throw new Error('Subscription should be valid.')
    const state: NotificationState = {
      alerts: [],
      broadcasts: [],
      deliveryLogs: [],
      subscriptions: subscription.subscriptions,
    }
    const broadcast = createNotificationBroadcast({
      body: 'Sektor A1 žiada príchod kontrolóra.',
      severity: 'info',
      targetTopics: ['tournaments'],
      title: 'Tím žiada kontrolóra',
      validUntil: 'dnes 23:59',
    }, state, 'Súťažný dispečing', now)
    if (!broadcast.ok) throw new Error('Broadcast should be valid.')
    let sendCount = 0

    const result = await runServerNotificationDelivery(broadcast.broadcast, state, {
      hasVapidConfig: true,
      now,
      provider: 'web-push',
      sendWebPush: async () => {
        sendCount += 1

        return { statusCode: 201 }
      },
      subject: 'mailto:spravca@example.test',
      vapidPrivateKey: 'private-key',
      vapidPublicKey: 'public-key',
    })

    expect(sendCount).toBe(0)
    expect(result.broadcast.status).toBe('prepared')
    expect(result.deliveryLogs[0]).toMatchObject({
      message: 'Skúšobný odber čaká na reálny Web Push endpoint zariadenia.',
      status: 'prepared',
    })
  })

  it('opens a large catch notification directly in admin moderation', async () => {
    const subscription = savePushSubscription({
      auth: 'auth-secret',
      endpoint: 'https://push.example.test/manager',
      p256dh: 'p256dh-key',
      permission: 'granted',
      topics: ['service'],
    }, {
      alerts: [],
      broadcasts: [],
      deliveryLogs: [],
      subscriptions: [],
    }, now)
    if (!subscription.ok) throw new Error('Subscription should be valid.')
    const state: NotificationState = {
      alerts: [],
      broadcasts: [],
      deliveryLogs: [],
      subscriptions: subscription.subscriptions.map((item) => ({
        ...item,
        audienceRole: 'manager',
      })),
    }
    const broadcast = createNotificationBroadcast({
      body: '21.4 kg Kapor · Chata 3 · Marek H.',
      severity: 'water',
      targetAudience: {
        requestId: 'catch-20260621-vc-03-marek-h',
        roles: ['owner', 'manager'],
      },
      targetTopics: ['service'],
      title: 'Veľký úlovok čaká na kontrolu',
      validUntil: 'do spracovania úlovku',
    }, state, 'Evidencia úlovkov', now)
    if (!broadcast.ok) throw new Error('Broadcast should be valid.')
    const payloads: unknown[] = []

    await runServerNotificationDelivery(broadcast.broadcast, state, {
      hasVapidConfig: true,
      now,
      provider: 'web-push',
      sendWebPush: async (_pushSubscription, payload) => {
        payloads.push(JSON.parse(payload))
        return { statusCode: 201 }
      },
      subject: 'mailto:spravca@example.test',
      vapidPrivateKey: 'private-key',
      vapidPublicKey: 'public-key',
    })

    expect(payloads).toContainEqual(expect.objectContaining({
      url: '/admin/ulovky?catchId=catch-20260621-vc-03-marek-h',
    }))
  })

  it('opens internal reservation notifications directly in admin reservations', async () => {
    const subscription = savePushSubscription({
      auth: 'auth-secret',
      audienceRole: 'manager',
      endpoint: 'https://push.example.test/reservation-manager',
      p256dh: 'p256dh-key',
      permission: 'granted',
      topics: ['reservations'],
    }, {
      alerts: [],
      broadcasts: [],
      deliveryLogs: [],
      subscriptions: [],
    }, now)
    if (!subscription.ok) throw new Error('Subscription should be valid.')
    const state: NotificationState = {
      alerts: [],
      broadcasts: [],
      deliveryLogs: [],
      subscriptions: subscription.subscriptions,
    }
    const broadcast = createNotificationBroadcast({
      body: 'Veľký Cetín · Chata 3 · 2026-06-10 až 2026-06-12 · +421 900 123 999.',
      severity: 'info',
      targetAudience: {
        requestId: 'req-20260610-vc-03-3999',
        roles: ['owner', 'manager', 'worker'],
      },
      targetTopics: ['reservations'],
      title: 'Nová rezervácia: Ján Route',
      validUntil: 'do spracovania rezervácie',
    }, state, 'Rezervačný formulár', now)
    if (!broadcast.ok) throw new Error('Broadcast should be valid.')
    const payloads: unknown[] = []

    await runServerNotificationDelivery(broadcast.broadcast, state, {
      hasVapidConfig: true,
      now,
      provider: 'web-push',
      sendWebPush: async (_pushSubscription, payload) => {
        payloads.push(JSON.parse(payload))
        return { statusCode: 201 }
      },
      subject: 'mailto:spravca@example.test',
      vapidPrivateKey: 'private-key',
      vapidPublicKey: 'public-key',
    })

    expect(payloads).toContainEqual(expect.objectContaining({
      url: '/admin/rezervacie?rezervacia=req-20260610-vc-03-3999',
    }))
  })
})
