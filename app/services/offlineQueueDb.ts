export const OFFLINE_QUEUE_STORES = {
  adminTournamentActions: 'admin-tournament-actions',
  catches: 'catch-submissions',
  placeIssues: 'place-issues',
  reservations: 'reservation-requests',
  tournamentRequests: 'tournament-requests',
} as const

export const OFFLINE_QUEUE_CHANGED_EVENT = 'rybolov:offline-queue-changed'

const DB_NAME = 'rybolov-cetin-offline'
const DB_VERSION = 5

export type OfflineQueueStoreName = typeof OFFLINE_QUEUE_STORES[keyof typeof OFFLINE_QUEUE_STORES]

export interface FetchLikeError {
  data?: {
    data?: {
      messages?: string[]
    }
    message?: string
    statusCode?: number
    statusMessage?: string
  }
  response?: {
    status?: number
  }
  status?: number
  statusCode?: number
  statusMessage?: string
}

function getIndexedDb() {
  if (typeof indexedDB === 'undefined') {
    throw new Error('Offline úložisko nie je v tomto prehliadači dostupné.')
  }

  return indexedDB
}

function ensureStore(database: IDBDatabase, storeName: OfflineQueueStoreName) {
  if (database.objectStoreNames.contains(storeName)) return

  const store = database.createObjectStore(storeName, { keyPath: 'id' })
  store.createIndex('createdAt', 'createdAt', { unique: false })
}

export function openOfflineQueueDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = getIndexedDb().open(DB_NAME, DB_VERSION)

    request.addEventListener('upgradeneeded', () => {
      const database = request.result

      ensureStore(database, OFFLINE_QUEUE_STORES.catches)
      ensureStore(database, OFFLINE_QUEUE_STORES.placeIssues)
      ensureStore(database, OFFLINE_QUEUE_STORES.reservations)
      ensureStore(database, OFFLINE_QUEUE_STORES.tournamentRequests)
      ensureStore(database, OFFLINE_QUEUE_STORES.adminTournamentActions)
    })

    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB open failed.')))
  })
}

export function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB request failed.')))
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasNonEmptyString(record: Record<string, unknown>, key: string) {
  return typeof record[key] === 'string' && record[key].length > 0
}

function hasQueueEnvelope(value: unknown): value is Record<string, unknown> & { payload: Record<string, unknown> } {
  if (!isRecord(value) || !isRecord(value.payload)) return false

  return hasNonEmptyString(value, 'id')
    && hasNonEmptyString(value, 'createdAt')
    && hasNonEmptyString(value, 'updatedAt')
    && typeof value.attempts === 'number'
    && Number.isInteger(value.attempts)
    && value.attempts >= 0
}

/**
 * Lightweight integrity check for the global queue badge. Full Zod validation
 * remains in each queue service before records are displayed or submitted.
 */
export function isOfflineQueueRecord(storeName: OfflineQueueStoreName, value: unknown) {
  if (!hasQueueEnvelope(value)) return false
  const payload = value.payload

  if (storeName === OFFLINE_QUEUE_STORES.reservations) {
    return ['contactName', 'contactPhone', 'dateFrom', 'dateTo', 'lake', 'pegId', 'permitId']
      .every((key) => hasNonEmptyString(payload, key))
      && Array.isArray(payload.extraIds)
      && Array.isArray(payload.rentalIds)
  }

  if (storeName === OFFLINE_QUEUE_STORES.catches) {
    return ['angler', 'bait', 'caughtAt', 'lake', 'pegId', 'species']
      .every((key) => hasNonEmptyString(payload, key))
      && typeof payload.released === 'boolean'
      && typeof payload.lengthCm === 'number'
      && typeof payload.weightKg === 'number'
  }

  if (storeName === OFFLINE_QUEUE_STORES.placeIssues) {
    return ['category', 'description', 'lake', 'targetType', 'title']
      .every((key) => hasNonEmptyString(payload, key))
  }

  if (storeName === OFFLINE_QUEUE_STORES.tournamentRequests) {
    return ['sectorId', 'tournamentId', 'type']
      .every((key) => hasNonEmptyString(payload, key))
  }

  return hasNonEmptyString(payload, 'kind') && isRecord(payload.payload)
}

async function countValidQueueRecords(
  transaction: IDBTransaction,
  storeName: OfflineQueueStoreName,
) {
  const records = await requestToPromise<unknown[]>(transaction.objectStore(storeName).getAll())
  return records.filter((record) => isOfflineQueueRecord(storeName, record)).length
}

export async function readOfflineQueueCounts() {
  const database = await openOfflineQueueDb()

  try {
    const transaction = database.transaction(Object.values(OFFLINE_QUEUE_STORES), 'readonly')
    const [adminTournamentActions, catches, placeIssues, reservations, tournamentRequests] = await Promise.all([
      countValidQueueRecords(transaction, OFFLINE_QUEUE_STORES.adminTournamentActions),
      countValidQueueRecords(transaction, OFFLINE_QUEUE_STORES.catches),
      countValidQueueRecords(transaction, OFFLINE_QUEUE_STORES.placeIssues),
      countValidQueueRecords(transaction, OFFLINE_QUEUE_STORES.reservations),
      countValidQueueRecords(transaction, OFFLINE_QUEUE_STORES.tournamentRequests),
    ])

    return {
      adminTournamentActions,
      catches,
      placeIssues,
      reservations,
      tournamentRequests,
    }
  }
  finally {
    database.close()
  }
}

export function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve())
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.')))
    transaction.addEventListener('error', () => reject(transaction.error ?? new Error('IndexedDB transaction failed.')))
  })
}

export function getOfflineQueueFetchErrorStatusCode(error: unknown) {
  const fetchError = error as FetchLikeError

  return fetchError.statusCode ??
    fetchError.status ??
    fetchError.response?.status ??
    fetchError.data?.statusCode
}

export function getOfflineQueueErrorMessage(error: unknown, fallback: string) {
  const fetchError = error as FetchLikeError
  const messages = fetchError.data?.data?.messages

  return messages?.join(' ') ||
    fetchError.data?.message ||
    fetchError.data?.statusMessage ||
    fetchError.statusMessage ||
    fallback
}

export function notifyOfflineQueueChanged() {
  if (typeof window === 'undefined') return

  window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_CHANGED_EVENT))
}
