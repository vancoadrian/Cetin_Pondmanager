import { z } from 'zod'
import { catchRecordInputSchema } from '~/schemas/pondSchemas'
import {
  getOfflineQueueErrorMessage,
  getOfflineQueueFetchErrorStatusCode,
  notifyOfflineQueueChanged,
  OFFLINE_QUEUE_STORES,
  openOfflineQueueDb,
  requestToPromise,
  transactionDone,
} from '~/services/offlineQueueDb'

const CATCH_STORE_NAME = OFFLINE_QUEUE_STORES.catches

const offlineCatchPayloadSchema = catchRecordInputSchema.extend({
  logbookId: z.string().trim().optional(),
})

export type OfflineCatchPayload = z.infer<typeof offlineCatchPayloadSchema>

export const offlineCatchQueueItemSchema = z.object({
  attempts: z.number().int().min(0).default(0),
  createdAt: z.string().min(1),
  id: z.string().min(1),
  lastError: z.string().optional(),
  payload: offlineCatchPayloadSchema,
  updatedAt: z.string().min(1),
})

export type OfflineCatchQueueItem = z.infer<typeof offlineCatchQueueItemSchema>

export interface OfflineCatchQueueItemOptions {
  id?: string
  now?: string
}

function createQueueId(now: string) {
  const datePart = now.replace(/\D/g, '').slice(0, 14) || 'now'
  const randomPart = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)

  return `offline-catch-${datePart}-${randomPart}`
}

export function createOfflineCatchQueueItem(
  payload: OfflineCatchPayload,
  options: OfflineCatchQueueItemOptions = {},
): OfflineCatchQueueItem {
  const now = options.now ?? new Date().toISOString()

  return offlineCatchQueueItemSchema.parse({
    attempts: 0,
    createdAt: now,
    id: options.id ?? createQueueId(now),
    payload,
    updatedAt: now,
  })
}

export function sanitizeOfflineCatchQueueItems(rawItems: unknown[]) {
  return rawItems
    .map((item) => offlineCatchQueueItemSchema.safeParse(item))
    .filter((result): result is z.SafeParseSuccess<OfflineCatchQueueItem> => result.success)
    .map((result) => result.data)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function getFetchErrorStatusCode(error: unknown) {
  return getOfflineQueueFetchErrorStatusCode(error)
}

export function getOfflineCatchQueueErrorMessage(error: unknown) {
  return getOfflineQueueErrorMessage(error, 'Odoslanie z offline fronty sa nepodarilo.')
}

export function shouldQueueCatchSubmission(error: unknown, online = true) {
  if (!online) return true

  return !getFetchErrorStatusCode(error)
}

export async function readOfflineCatchQueue() {
  const database = await openOfflineQueueDb()

  try {
    const transaction = database.transaction(CATCH_STORE_NAME, 'readonly')
    const store = transaction.objectStore(CATCH_STORE_NAME)
    const items = await requestToPromise<unknown[]>(store.getAll())

    return sanitizeOfflineCatchQueueItems(items)
  }
  finally {
    database.close()
  }
}

export async function enqueueOfflineCatch(payload: OfflineCatchPayload, options: OfflineCatchQueueItemOptions = {}) {
  const item = createOfflineCatchQueueItem(payload, options)
  const database = await openOfflineQueueDb()

  try {
    const transaction = database.transaction(CATCH_STORE_NAME, 'readwrite')
    transaction.objectStore(CATCH_STORE_NAME).add(item)
    await transactionDone(transaction)
    notifyOfflineQueueChanged()

    return item
  }
  finally {
    database.close()
  }
}

export async function removeOfflineCatch(id: string) {
  const database = await openOfflineQueueDb()

  try {
    const transaction = database.transaction(CATCH_STORE_NAME, 'readwrite')
    transaction.objectStore(CATCH_STORE_NAME).delete(id)
    await transactionDone(transaction)
    notifyOfflineQueueChanged()
  }
  finally {
    database.close()
  }
}

export async function markOfflineCatchAttempt(id: string, errorMessage: string, now = new Date().toISOString()) {
  const database = await openOfflineQueueDb()

  try {
    const transaction = database.transaction(CATCH_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(CATCH_STORE_NAME)
    const rawItem = await requestToPromise<unknown>(store.get(id))
    const item = offlineCatchQueueItemSchema.safeParse(rawItem)

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
