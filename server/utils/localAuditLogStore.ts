import { join } from 'node:path'
import type { AuditEvent } from '~/data/pond'
import {
  cloneAuditEvents,
  createAuditEvent,
  type AuditEventInput,
  type AuditLogState,
} from '~/services/auditLogService'
import {
  guardCorruptRuntimeState,
  mutateRuntimeDocument,
  readRuntimeDocument,
  writeRuntimeDocument,
} from './runtimeStateStore'

export interface LocalAuditLogState extends AuditLogState {
  updatedAt: string
  version: 1
}

export interface StoredAuditEventAppend {
  event: AuditEvent
  state: LocalAuditLogState
}

const STORE_KEY = 'audit-log'

export function resolveLocalAuditLogStorePath() {
  return process.env.RYBOLOV_LOCAL_AUDIT_LOG_STORE
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'audit-log.json')
}

export function createSeedAuditLogState(updatedAt = new Date(0).toISOString()): LocalAuditLogState {
  return {
    events: [],
    updatedAt,
    version: 1,
  }
}

function isAuditLogState(value: unknown): value is LocalAuditLogState {
  const candidate = value as Partial<LocalAuditLogState>

  return (
    candidate.version === 1 &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.events)
  )
}

function parseLocalAuditLogState(payload: unknown): LocalAuditLogState | undefined {
  if (!isAuditLogState(payload)) return undefined

  return {
    ...payload,
    events: cloneAuditEvents(payload.events),
  }
}

function composeAuditLogState(state: AuditLogState): LocalAuditLogState {
  return {
    events: cloneAuditEvents(state.events),
    updatedAt: new Date().toISOString(),
    version: 1,
  }
}

export async function readLocalAuditLogState(
  filePath = resolveLocalAuditLogStorePath(),
): Promise<LocalAuditLogState> {
  const document = await readRuntimeDocument(STORE_KEY, filePath)

  if (document.found) {
    const parsed = parseLocalAuditLogState(document.payload)
    if (parsed) return parsed
    guardCorruptRuntimeState(STORE_KEY)
  }

  const seedState = createSeedAuditLogState()
  await writeLocalAuditLogState(seedState, filePath)

  return seedState
}

export async function writeLocalAuditLogState(
  state: AuditLogState,
  filePath = resolveLocalAuditLogStorePath(),
): Promise<LocalAuditLogState> {
  const nextState = composeAuditLogState(state)
  await writeRuntimeDocument(STORE_KEY, filePath, nextState)

  return nextState
}

export async function appendLocalAuditEvent(
  input: AuditEventInput,
  filePath = resolveLocalAuditLogStorePath(),
): Promise<StoredAuditEventAppend> {
  return mutateRuntimeDocument(STORE_KEY, filePath, async (document) => {
    let currentState: LocalAuditLogState | undefined
    if (document.found) {
      currentState = parseLocalAuditLogState(document.payload)
      if (!currentState) guardCorruptRuntimeState(STORE_KEY)
    }
    currentState ??= createSeedAuditLogState()

    const event = createAuditEvent(input, currentState.events)
    const state = composeAuditLogState({
      events: [event, ...currentState.events].slice(0, 500),
    })

    return {
      payload: state,
      result: { event, state },
    }
  })
}
