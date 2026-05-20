import { z } from 'zod'
import { tournamentRequestInputSchema } from '~/schemas/pondSchemas'
import {
  getOfflineQueueErrorMessage,
  getOfflineQueueFetchErrorStatusCode,
  notifyOfflineQueueChanged,
  OFFLINE_QUEUE_STORES,
  openOfflineQueueDb,
  requestToPromise,
  transactionDone,
} from '~/services/offlineQueueDb'

const REQUEST_STORE_NAME = OFFLINE_QUEUE_STORES.tournamentRequests

export type OfflineTournamentRequestPayload = z.infer<typeof tournamentRequestInputSchema>

export const offlineTournamentRequestQueueItemSchema = z.object({
  attempts: z.number().int().min(0).default(0),
  createdAt: z.string().min(1),
  id: z.string().min(1),
  lastError: z.string().optional(),
  payload: tournamentRequestInputSchema,
  updatedAt: z.string().min(1),
})

export type OfflineTournamentRequestQueueItem = z.infer<typeof offlineTournamentRequestQueueItemSchema>

export interface OfflineTournamentRequestQueueItemOptions {
  id?: string
  now?: string
}

function createQueueId(payload: OfflineTournamentRequestPayload, now: string) {
  const datePart = now.replace(/\D/g, '').slice(0, 14) || 'now'
  const randomPart = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)

  return `offline-tournament-${datePart}-${payload.sectorId}-${randomPart}`
}

export function createOfflineTournamentRequestQueueItem(
  payload: OfflineTournamentRequestPayload,
  options: OfflineTournamentRequestQueueItemOptions = {},
): OfflineTournamentRequestQueueItem {
  const now = options.now ?? new Date().toISOString()

  return offlineTournamentRequestQueueItemSchema.parse({
    attempts: 0,
    createdAt: now,
    id: options.id ?? createQueueId(payload, now),
    payload,
    updatedAt: now,
  })
}

export function sanitizeOfflineTournamentRequestQueueItems(rawItems: unknown[]) {
  return rawItems
    .map((item) => offlineTournamentRequestQueueItemSchema.safeParse(item))
    .filter((result): result is z.SafeParseSuccess<OfflineTournamentRequestQueueItem> => result.success)
    .map((result) => result.data)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function getTournamentRequestFetchErrorStatusCode(error: unknown) {
  return getOfflineQueueFetchErrorStatusCode(error)
}

export function getOfflineTournamentRequestQueueErrorMessage(error: unknown) {
  return getOfflineQueueErrorMessage(
    error,
    'Odoslanie súťažného hlásenia z offline fronty sa nepodarilo.',
  )
}

export function shouldQueueTournamentRequestSubmission(error: unknown, online = true) {
  if (!online) return true

  return !getTournamentRequestFetchErrorStatusCode(error)
}

export async function readOfflineTournamentRequestQueue() {
  const database = await openOfflineQueueDb()

  try {
    const transaction = database.transaction(REQUEST_STORE_NAME, 'readonly')
    const store = transaction.objectStore(REQUEST_STORE_NAME)
    const items = await requestToPromise<unknown[]>(store.getAll())

    return sanitizeOfflineTournamentRequestQueueItems(items)
  }
  finally {
    database.close()
  }
}

export async function enqueueOfflineTournamentRequest(
  payload: OfflineTournamentRequestPayload,
  options: OfflineTournamentRequestQueueItemOptions = {},
) {
  const item = createOfflineTournamentRequestQueueItem(payload, options)
  const database = await openOfflineQueueDb()

  try {
    const transaction = database.transaction(REQUEST_STORE_NAME, 'readwrite')
    transaction.objectStore(REQUEST_STORE_NAME).add(item)
    await transactionDone(transaction)
    notifyOfflineQueueChanged()

    return item
  }
  finally {
    database.close()
  }
}

export async function removeOfflineTournamentRequest(id: string) {
  const database = await openOfflineQueueDb()

  try {
    const transaction = database.transaction(REQUEST_STORE_NAME, 'readwrite')
    transaction.objectStore(REQUEST_STORE_NAME).delete(id)
    await transactionDone(transaction)
    notifyOfflineQueueChanged()
  }
  finally {
    database.close()
  }
}

export async function markOfflineTournamentRequestAttempt(
  id: string,
  errorMessage: string,
  now = new Date().toISOString(),
) {
  const database = await openOfflineQueueDb()

  try {
    const transaction = database.transaction(REQUEST_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(REQUEST_STORE_NAME)
    const rawItem = await requestToPromise<unknown>(store.get(id))
    const item = offlineTournamentRequestQueueItemSchema.safeParse(rawItem)

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
