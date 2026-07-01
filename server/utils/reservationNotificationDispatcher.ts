import type { NotificationAudienceRole, Reservation } from '~/data/pond'
import { createNotificationBroadcast } from '~/services/notificationService'
import {
  readLocalNotificationState,
  resolveLocalNotificationStorePath,
  writeLocalNotificationState,
} from './localNotificationStore'
import { runServerNotificationDelivery } from './notificationDeliveryRunner'
import { resolveNotificationDeliveryOptions } from './notificationDeliveryProvider'

interface ReservationNotificationInput {
  lakeName: string
  now?: string
  pegLabel: string
  reservation: Pick<Reservation, 'contactPhone' | 'from' | 'guest' | 'id' | 'rentalIds' | 'extraIds' | 'to'>
  roles?: NotificationAudienceRole[]
}

const defaultReservationAudienceRoles: NotificationAudienceRole[] = ['owner', 'manager', 'worker']

function limitText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value
}

function formatReservationRange(reservation: Pick<Reservation, 'from' | 'to'>) {
  return reservation.from === reservation.to
    ? reservation.from
    : `${reservation.from} až ${reservation.to}`
}

export async function appendReservationRequestNotificationBroadcast(
  input: ReservationNotificationInput,
  filePath = resolveLocalNotificationStorePath(),
) {
  const state = await readLocalNotificationState(filePath)
  const result = createNotificationBroadcast(
    {
      body: limitText(
        `${input.lakeName} · ${input.pegLabel} · ${formatReservationRange(input.reservation)} · ${input.reservation.contactPhone}. Výbava ${input.reservation.rentalIds.length}, doplnky ${input.reservation.extraIds.length}.`,
        280,
      ),
      severity: 'info',
      targetAudience: {
        reason: 'nová webová žiadosť o rezerváciu',
        requestId: input.reservation.id,
        roles: [...new Set(input.roles ?? defaultReservationAudienceRoles)],
      },
      targetTopics: ['reservations'],
      title: limitText(`Nová rezervácia: ${input.reservation.guest}`, 80),
      validUntil: 'do spracovania rezervácie',
    },
    state,
    'Rezervačný formulár',
    input.now,
  )

  if (!result.ok) {
    console.warn(`Notifikáciu k rezervácii sa nepodarilo pripraviť: ${result.messages.join(' ')}`)
    return undefined
  }

  const deliveryRun = await runServerNotificationDelivery(
    result.broadcast,
    state,
    resolveNotificationDeliveryOptions(input.now),
  )
  const broadcasts = result.broadcasts.map((broadcast) =>
    broadcast.id === deliveryRun.broadcast.id ? deliveryRun.broadcast : broadcast,
  )
  const deliveryLogs = [...deliveryRun.deliveryLogs, ...state.deliveryLogs].slice(0, 500)

  await writeLocalNotificationState({
    alerts: state.alerts,
    broadcasts,
    deliveryLogs,
    subscriptions: result.subscriptions,
  }, filePath)

  return {
    broadcast: deliveryRun.broadcast,
    broadcasts,
    deliveryLogs,
  }
}

export async function tryAppendReservationRequestNotificationBroadcast(
  input: ReservationNotificationInput,
  filePath = resolveLocalNotificationStorePath(),
) {
  try {
    return await appendReservationRequestNotificationBroadcast(input, filePath)
  }
  catch (error) {
    console.warn(`Notifikáciu k rezervácii sa nepodarilo uložiť: ${(error as Error).message}`)
    return undefined
  }
}
