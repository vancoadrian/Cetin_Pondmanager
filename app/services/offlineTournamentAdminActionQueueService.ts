import { z } from 'zod'
import {
  tournamentPenaltyInputSchema,
  tournamentRuleCheckInputSchema,
} from '~/schemas/pondSchemas'
import {
  getOfflineQueueErrorMessage,
  getOfflineQueueFetchErrorStatusCode,
  notifyOfflineQueueChanged,
  OFFLINE_QUEUE_STORES,
  openOfflineQueueDb,
  requestToPromise,
  transactionDone,
} from '~/services/offlineQueueDb'

const ADMIN_TOURNAMENT_ACTION_STORE_NAME = OFFLINE_QUEUE_STORES.adminTournamentActions

export const tournamentCatchVerificationPayloadSchema = z.object({
  catchId: z.string().trim().min(1, 'Chýba ID úlovku.'),
  clientMutationId: z.string().trim().min(1, 'Chýba ID offline úkonu.').max(160, 'ID offline úkonu je príliš dlhé.').optional(),
  marshalId: z.string().trim().optional(),
  status: z.enum(['verified', 'disputed']),
})

export const tournamentRequestActionPayloadSchema = z.object({
  action: z.enum(['assign', 'resolve']),
  clientMutationId: z.string().trim().min(1, 'Chýba ID offline úkonu.').max(160, 'ID offline úkonu je príliš dlhé.').optional(),
  marshalId: z.string().trim().optional(),
  requestId: z.string().trim().min(1, 'Chýba ID hlásenia.'),
})

export const offlineTournamentAdminActionPayloadSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('request-action'),
    payload: tournamentRequestActionPayloadSchema,
  }),
  z.object({
    kind: z.literal('catch-verification'),
    payload: tournamentCatchVerificationPayloadSchema,
  }),
  z.object({
    kind: z.literal('penalty'),
    payload: tournamentPenaltyInputSchema,
  }),
  z.object({
    kind: z.literal('rule-check'),
    payload: tournamentRuleCheckInputSchema,
  }),
])

export type OfflineTournamentAdminActionPayload = z.infer<typeof offlineTournamentAdminActionPayloadSchema>

export const offlineTournamentAdminActionQueueItemSchema = z.object({
  attempts: z.number().int().min(0).default(0),
  createdAt: z.string().min(1),
  id: z.string().min(1),
  lastError: z.string().optional(),
  payload: offlineTournamentAdminActionPayloadSchema,
  updatedAt: z.string().min(1),
})

export type OfflineTournamentAdminActionQueueItem = z.infer<typeof offlineTournamentAdminActionQueueItemSchema>

export interface OfflineTournamentAdminActionQueueItemOptions {
  id?: string
  now?: string
}

function createQueueId(payload: OfflineTournamentAdminActionPayload, now: string) {
  const datePart = now.replace(/\D/g, '').slice(0, 14) || 'now'
  const randomPart = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
  const target = payload.kind === 'request-action'
    ? payload.payload.requestId
    : payload.kind === 'catch-verification'
      ? payload.payload.catchId
      : payload.payload.sectorId

  return `offline-admin-tournament-${datePart}-${payload.kind}-${target}-${randomPart}`
}

function getPayloadClientMutationId(payload: OfflineTournamentAdminActionPayload) {
  return payload.payload.clientMutationId
}

function setPayloadClientMutationId(
  payload: OfflineTournamentAdminActionPayload,
  clientMutationId: string,
): OfflineTournamentAdminActionPayload {
  if (payload.kind === 'request-action') {
    return {
      kind: payload.kind,
      payload: {
        ...payload.payload,
        clientMutationId,
      },
    }
  }
  if (payload.kind === 'catch-verification') {
    return {
      kind: payload.kind,
      payload: {
        ...payload.payload,
        clientMutationId,
      },
    }
  }
  if (payload.kind === 'penalty') {
    return {
      kind: payload.kind,
      payload: {
        ...payload.payload,
        clientMutationId,
      },
    }
  }

  return {
    kind: payload.kind,
    payload: {
      ...payload.payload,
      clientMutationId,
    },
  }
}

export function withTournamentAdminActionClientMutationId(
  payload: OfflineTournamentAdminActionPayload,
  options: OfflineTournamentAdminActionQueueItemOptions = {},
): OfflineTournamentAdminActionPayload {
  const now = options.now ?? new Date().toISOString()
  const clientMutationId = getPayloadClientMutationId(payload)
    ?? options.id
    ?? createQueueId(payload, now)

  return offlineTournamentAdminActionPayloadSchema.parse(
    setPayloadClientMutationId(payload, clientMutationId),
  )
}

export function createOfflineTournamentAdminActionQueueItem(
  payload: OfflineTournamentAdminActionPayload,
  options: OfflineTournamentAdminActionQueueItemOptions = {},
): OfflineTournamentAdminActionQueueItem {
  const now = options.now ?? new Date().toISOString()
  const payloadWithClientMutationId = withTournamentAdminActionClientMutationId(payload, {
    id: options.id,
    now,
  })

  return offlineTournamentAdminActionQueueItemSchema.parse({
    attempts: 0,
    createdAt: now,
    id: options.id ?? getPayloadClientMutationId(payloadWithClientMutationId) ?? createQueueId(payload, now),
    payload: payloadWithClientMutationId,
    updatedAt: now,
  })
}

export function sanitizeOfflineTournamentAdminActionQueueItems(rawItems: unknown[]) {
  return rawItems
    .map((item) => offlineTournamentAdminActionQueueItemSchema.safeParse(item))
    .filter((result): result is z.SafeParseSuccess<OfflineTournamentAdminActionQueueItem> => result.success)
    .map((result) => result.data)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function getTournamentAdminActionFetchErrorStatusCode(error: unknown) {
  return getOfflineQueueFetchErrorStatusCode(error)
}

export function getOfflineTournamentAdminActionQueueErrorMessage(error: unknown) {
  return getOfflineQueueErrorMessage(
    error,
    'Odoslanie kontrolórskej súťažnej akcie z offline fronty sa nepodarilo.',
  )
}

export function shouldQueueTournamentAdminActionSubmission(error: unknown, online = true) {
  if (!online) return true

  return !getTournamentAdminActionFetchErrorStatusCode(error)
}

export async function readOfflineTournamentAdminActionQueue() {
  const database = await openOfflineQueueDb()

  try {
    const transaction = database.transaction(ADMIN_TOURNAMENT_ACTION_STORE_NAME, 'readonly')
    const store = transaction.objectStore(ADMIN_TOURNAMENT_ACTION_STORE_NAME)
    const items = await requestToPromise<unknown[]>(store.getAll())

    return sanitizeOfflineTournamentAdminActionQueueItems(items)
  }
  finally {
    database.close()
  }
}

export async function enqueueOfflineTournamentAdminAction(
  payload: OfflineTournamentAdminActionPayload,
  options: OfflineTournamentAdminActionQueueItemOptions = {},
) {
  const item = createOfflineTournamentAdminActionQueueItem(payload, options)
  const database = await openOfflineQueueDb()

  try {
    const transaction = database.transaction(ADMIN_TOURNAMENT_ACTION_STORE_NAME, 'readwrite')
    transaction.objectStore(ADMIN_TOURNAMENT_ACTION_STORE_NAME).add(item)
    await transactionDone(transaction)
    notifyOfflineQueueChanged()

    return item
  }
  finally {
    database.close()
  }
}

export async function removeOfflineTournamentAdminAction(id: string) {
  const database = await openOfflineQueueDb()

  try {
    const transaction = database.transaction(ADMIN_TOURNAMENT_ACTION_STORE_NAME, 'readwrite')
    transaction.objectStore(ADMIN_TOURNAMENT_ACTION_STORE_NAME).delete(id)
    await transactionDone(transaction)
    notifyOfflineQueueChanged()
  }
  finally {
    database.close()
  }
}

export async function markOfflineTournamentAdminActionAttempt(
  id: string,
  errorMessage: string,
  now = new Date().toISOString(),
) {
  const database = await openOfflineQueueDb()

  try {
    const transaction = database.transaction(ADMIN_TOURNAMENT_ACTION_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(ADMIN_TOURNAMENT_ACTION_STORE_NAME)
    const rawItem = await requestToPromise<unknown>(store.get(id))
    const item = offlineTournamentAdminActionQueueItemSchema.safeParse(rawItem)

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
