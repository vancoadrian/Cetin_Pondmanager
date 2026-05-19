import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AuditEvent } from '~/data/pond'
import {
  cloneAuditEvents,
  createAuditEvent,
  type AuditEventInput,
  type AuditLogState,
} from '~/services/auditLogService'

export interface LocalAuditLogState extends AuditLogState {
  updatedAt: string
  version: 1
}

export interface StoredAuditEventAppend {
  event: AuditEvent
  state: LocalAuditLogState
}

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

export async function readLocalAuditLogState(
  filePath = resolveLocalAuditLogStorePath(),
): Promise<LocalAuditLogState> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)

    if (isAuditLogState(parsed)) {
      return {
        ...parsed,
        events: cloneAuditEvents(parsed.events),
      }
    }
  }
  catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException
    if (maybeNodeError.code !== 'ENOENT') {
      console.warn(`Nepodarilo sa načítať lokálny audit log: ${maybeNodeError.message}`)
    }
  }

  const seedState = createSeedAuditLogState()
  await writeLocalAuditLogState(seedState, filePath)

  return seedState
}

export async function writeLocalAuditLogState(
  state: AuditLogState,
  filePath = resolveLocalAuditLogStorePath(),
): Promise<LocalAuditLogState> {
  const nextState: LocalAuditLogState = {
    events: cloneAuditEvents(state.events),
    updatedAt: new Date().toISOString(),
    version: 1,
  }

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8')

  return nextState
}

export async function appendLocalAuditEvent(
  input: AuditEventInput,
  filePath = resolveLocalAuditLogStorePath(),
): Promise<StoredAuditEventAppend> {
  const currentState = await readLocalAuditLogState(filePath)
  const event = createAuditEvent(input, currentState.events)
  const state = await writeLocalAuditLogState(
    {
      events: [event, ...currentState.events].slice(0, 500),
    },
    filePath,
  )

  return {
    event,
    state,
  }
}
