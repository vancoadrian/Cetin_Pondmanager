import { z } from 'zod'
import { placeIssueInputSchema } from '~/schemas/pondSchemas'
import {
  getOfflineQueueErrorMessage,
  getOfflineQueueFetchErrorStatusCode,
  notifyOfflineQueueChanged,
  OFFLINE_QUEUE_STORES,
  openOfflineQueueDb,
  requestToPromise,
  transactionDone,
} from '~/services/offlineQueueDb'

const PLACE_ISSUE_STORE_NAME = OFFLINE_QUEUE_STORES.placeIssues

export type OfflinePlaceIssuePayload = z.infer<typeof placeIssueInputSchema>

export const offlinePlaceIssueQueueItemSchema = z.object({
  attempts: z.number().int().min(0).default(0),
  createdAt: z.string().min(1),
  id: z.string().min(1),
  lastError: z.string().optional(),
  payload: placeIssueInputSchema,
  updatedAt: z.string().min(1),
})

export type OfflinePlaceIssueQueueItem = z.infer<typeof offlinePlaceIssueQueueItemSchema>

export interface OfflinePlaceIssueQueueItemOptions {
  id?: string
  now?: string
}

function createQueueId(payload: OfflinePlaceIssuePayload, now: string) {
  const datePart = now.replace(/\D/g, '').slice(0, 14) || 'now'
  const targetPart = payload.targetId ?? payload.lake
  const randomPart = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)

  return `offline-place-issue-${datePart}-${payload.targetType}-${targetPart}-${randomPart}`
}

export function createOfflinePlaceIssueQueueItem(
  payload: OfflinePlaceIssuePayload,
  options: OfflinePlaceIssueQueueItemOptions = {},
): OfflinePlaceIssueQueueItem {
  const now = options.now ?? new Date().toISOString()

  return offlinePlaceIssueQueueItemSchema.parse({
    attempts: 0,
    createdAt: now,
    id: options.id ?? createQueueId(payload, now),
    payload,
    updatedAt: now,
  })
}

export function sanitizeOfflinePlaceIssueQueueItems(rawItems: unknown[]) {
  return rawItems
    .map((item) => offlinePlaceIssueQueueItemSchema.safeParse(item))
    .filter((result): result is z.SafeParseSuccess<OfflinePlaceIssueQueueItem> => result.success)
    .map((result) => result.data)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function getPlaceIssueFetchErrorStatusCode(error: unknown) {
  return getOfflineQueueFetchErrorStatusCode(error)
}

export function getOfflinePlaceIssueQueueErrorMessage(error: unknown) {
  return getOfflineQueueErrorMessage(error, 'Hlásenie nedostatku sa nepodarilo odoslať z tohto zariadenia.')
}

export function shouldQueuePlaceIssueSubmission(error: unknown, online = true) {
  if (!online) return true

  return !getPlaceIssueFetchErrorStatusCode(error)
}

export async function readOfflinePlaceIssueQueue() {
  const database = await openOfflineQueueDb()

  try {
    const transaction = database.transaction(PLACE_ISSUE_STORE_NAME, 'readonly')
    const store = transaction.objectStore(PLACE_ISSUE_STORE_NAME)
    const items = await requestToPromise<unknown[]>(store.getAll())

    return sanitizeOfflinePlaceIssueQueueItems(items)
  }
  finally {
    database.close()
  }
}

export async function enqueueOfflinePlaceIssue(
  payload: OfflinePlaceIssuePayload,
  options: OfflinePlaceIssueQueueItemOptions = {},
) {
  const item = createOfflinePlaceIssueQueueItem(payload, options)
  const database = await openOfflineQueueDb()

  try {
    const transaction = database.transaction(PLACE_ISSUE_STORE_NAME, 'readwrite')
    transaction.objectStore(PLACE_ISSUE_STORE_NAME).add(item)
    await transactionDone(transaction)
    notifyOfflineQueueChanged()

    return item
  }
  finally {
    database.close()
  }
}

export async function removeOfflinePlaceIssue(id: string) {
  const database = await openOfflineQueueDb()

  try {
    const transaction = database.transaction(PLACE_ISSUE_STORE_NAME, 'readwrite')
    transaction.objectStore(PLACE_ISSUE_STORE_NAME).delete(id)
    await transactionDone(transaction)
    notifyOfflineQueueChanged()
  }
  finally {
    database.close()
  }
}

export async function markOfflinePlaceIssueAttempt(
  id: string,
  errorMessage: string,
  now = new Date().toISOString(),
) {
  const database = await openOfflineQueueDb()

  try {
    const transaction = database.transaction(PLACE_ISSUE_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(PLACE_ISSUE_STORE_NAME)
    const rawItem = await requestToPromise<unknown>(store.get(id))
    const item = offlinePlaceIssueQueueItemSchema.safeParse(rawItem)

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
