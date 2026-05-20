export const OFFLINE_QUEUE_STORES = {
  catches: 'catch-submissions',
  reservations: 'reservation-requests',
  tournamentRequests: 'tournament-requests',
} as const

export const OFFLINE_QUEUE_CHANGED_EVENT = 'rybolov:offline-queue-changed'

const DB_NAME = 'rybolov-cetin-offline'
const DB_VERSION = 3

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
      ensureStore(database, OFFLINE_QUEUE_STORES.reservations)
      ensureStore(database, OFFLINE_QUEUE_STORES.tournamentRequests)
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
