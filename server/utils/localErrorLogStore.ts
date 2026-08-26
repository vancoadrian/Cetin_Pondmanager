import { join } from 'node:path'
import {
  cloneObservedErrors,
  createObservedErrorEntry,
  type ErrorLogState,
  type ObservedErrorEntry,
  type ObservedErrorInput,
} from '~/services/observabilityService'
import {
  guardCorruptRuntimeState,
  mutateRuntimeDocument,
  readRuntimeDocument,
  writeRuntimeDocument,
} from './runtimeStateStore'

export interface LocalErrorLogState extends ErrorLogState {
  updatedAt: string
  version: 1
}

export interface StoredObservedErrorAppend {
  error: ObservedErrorEntry
  state: LocalErrorLogState
}

const STORE_KEY = 'error-log'

export function resolveLocalErrorLogStorePath() {
  return process.env.RYBOLOV_LOCAL_ERROR_LOG_STORE
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'error-log.json')
}

export function createSeedErrorLogState(updatedAt = new Date(0).toISOString()): LocalErrorLogState {
  return {
    errors: [],
    updatedAt,
    version: 1,
  }
}

function isErrorLogState(value: unknown): value is LocalErrorLogState {
  const candidate = value as Partial<LocalErrorLogState>

  return (
    candidate.version === 1 &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.errors)
  )
}

function parseLocalErrorLogState(payload: unknown): LocalErrorLogState | undefined {
  if (!isErrorLogState(payload)) return undefined

  return {
    ...payload,
    errors: cloneObservedErrors(payload.errors),
  }
}

function composeErrorLogState(state: ErrorLogState): LocalErrorLogState {
  return {
    errors: cloneObservedErrors(state.errors),
    updatedAt: new Date().toISOString(),
    version: 1,
  }
}

export async function readLocalErrorLogState(
  filePath = resolveLocalErrorLogStorePath(),
): Promise<LocalErrorLogState> {
  const document = await readRuntimeDocument(STORE_KEY, filePath)

  if (document.found) {
    const parsed = parseLocalErrorLogState(document.payload)
    if (parsed) return parsed
    guardCorruptRuntimeState(STORE_KEY)
  }

  const seedState = createSeedErrorLogState()
  await writeLocalErrorLogState(seedState, filePath)

  return seedState
}

export async function writeLocalErrorLogState(
  state: ErrorLogState,
  filePath = resolveLocalErrorLogStorePath(),
): Promise<LocalErrorLogState> {
  const nextState = composeErrorLogState(state)
  await writeRuntimeDocument(STORE_KEY, filePath, nextState)

  return nextState
}

export async function appendLocalObservedError(
  input: ObservedErrorInput,
  filePath = resolveLocalErrorLogStorePath(),
): Promise<StoredObservedErrorAppend> {
  return mutateRuntimeDocument(STORE_KEY, filePath, async (document) => {
    let currentState: LocalErrorLogState | undefined
    if (document.found) {
      currentState = parseLocalErrorLogState(document.payload)
      if (!currentState) guardCorruptRuntimeState(STORE_KEY)
    }
    currentState ??= createSeedErrorLogState()

    const error = createObservedErrorEntry(input, currentState.errors)
    const state = composeErrorLogState({
      errors: [error, ...currentState.errors].slice(0, 300),
    })

    return {
      payload: state,
      result: { error, state },
    }
  })
}
