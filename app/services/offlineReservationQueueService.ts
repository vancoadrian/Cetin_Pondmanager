import { z } from 'zod'
import { reservationRequestPayloadSchema } from '~/schemas/pondSchemas'
import {
  getOfflineQueueErrorMessage,
  getOfflineQueueFetchErrorStatusCode,
  notifyOfflineQueueChanged,
  OFFLINE_QUEUE_STORES,
  openOfflineQueueDb,
  requestToPromise,
  transactionDone,
} from '~/services/offlineQueueDb'

const RESERVATION_STORE_NAME = OFFLINE_QUEUE_STORES.reservations

export type OfflineReservationPayload = z.infer<typeof reservationRequestPayloadSchema>

export const offlineReservationQueueItemSchema = z.object({
  attempts: z.number().int().min(0).default(0),
  createdAt: z.string().min(1),
  id: z.string().min(1),
  lastError: z.string().optional(),
  payload: reservationRequestPayloadSchema,
  updatedAt: z.string().min(1),
})

export type OfflineReservationQueueItem = z.infer<typeof offlineReservationQueueItemSchema>

export interface OfflineReservationQueueItemOptions {
  id?: string
  now?: string
}

function createQueueId(payload: OfflineReservationPayload, now: string) {
  const datePart = now.replace(/\D/g, '').slice(0, 14) || 'now'
  const randomPart = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)

  return `offline-reservation-${datePart}-${payload.pegId}-${randomPart}`
}

export function createOfflineReservationQueueItem(
  payload: OfflineReservationPayload,
  options: OfflineReservationQueueItemOptions = {},
): OfflineReservationQueueItem {
  const now = options.now ?? new Date().toISOString()

  return offlineReservationQueueItemSchema.parse({
    attempts: 0,
    createdAt: now,
    id: options.id ?? createQueueId(payload, now),
    payload,
    updatedAt: now,
  })
}

export function sanitizeOfflineReservationQueueItems(rawItems: unknown[]) {
  return rawItems
    .map((item) => offlineReservationQueueItemSchema.safeParse(item))
    .filter((result): result is z.SafeParseSuccess<OfflineReservationQueueItem> => result.success)
    .map((result) => result.data)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function getReservationFetchErrorStatusCode(error: unknown) {
  return getOfflineQueueFetchErrorStatusCode(error)
}

export function getOfflineReservationQueueErrorMessage(error: unknown) {
  return getOfflineQueueErrorMessage(error, 'Rezerváciu sa nepodarilo odoslať z tohto zariadenia.')
}

export function shouldQueueReservationSubmission(error: unknown, online = true) {
  if (!online) return true

  return !getReservationFetchErrorStatusCode(error)
}

export async function readOfflineReservationQueue() {
  const database = await openOfflineQueueDb()

  try {
    const transaction = database.transaction(RESERVATION_STORE_NAME, 'readonly')
    const store = transaction.objectStore(RESERVATION_STORE_NAME)
    const items = await requestToPromise<unknown[]>(store.getAll())

    return sanitizeOfflineReservationQueueItems(items)
  }
  finally {
    database.close()
  }
}

export async function enqueueOfflineReservation(
  payload: OfflineReservationPayload,
  options: OfflineReservationQueueItemOptions = {},
) {
  const item = createOfflineReservationQueueItem(payload, options)
  const database = await openOfflineQueueDb()

  try {
    const transaction = database.transaction(RESERVATION_STORE_NAME, 'readwrite')
    transaction.objectStore(RESERVATION_STORE_NAME).add(item)
    await transactionDone(transaction)
    notifyOfflineQueueChanged()

    return item
  }
  finally {
    database.close()
  }
}

export async function removeOfflineReservation(id: string) {
  const database = await openOfflineQueueDb()

  try {
    const transaction = database.transaction(RESERVATION_STORE_NAME, 'readwrite')
    transaction.objectStore(RESERVATION_STORE_NAME).delete(id)
    await transactionDone(transaction)
    notifyOfflineQueueChanged()
  }
  finally {
    database.close()
  }
}

export async function markOfflineReservationAttempt(
  id: string,
  errorMessage: string,
  now = new Date().toISOString(),
) {
  const database = await openOfflineQueueDb()

  try {
    const transaction = database.transaction(RESERVATION_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(RESERVATION_STORE_NAME)
    const rawItem = await requestToPromise<unknown>(store.get(id))
    const item = offlineReservationQueueItemSchema.safeParse(rawItem)

    if (item.success) {
      store.put({
        ...item.data,
        attempts: item.data.attempts + 1,
        lastError: errorMessage,
        updatedAt: now,
      })
    }

    await transactionDone(transaction)
    notifyOfflineQueueChanged()
  }
  finally {
    database.close()
  }
}
