import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  cloneObservedErrors,
  createObservedErrorEntry,
  type ErrorLogState,
  type ObservedErrorEntry,
  type ObservedErrorInput,
} from '~/services/observabilityService'

export interface LocalErrorLogState extends ErrorLogState {
  updatedAt: string
  version: 1
}

export interface StoredObservedErrorAppend {
  error: ObservedErrorEntry
  state: LocalErrorLogState
}

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

export async function readLocalErrorLogState(
  filePath = resolveLocalErrorLogStorePath(),
): Promise<LocalErrorLogState> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)

    if (isErrorLogState(parsed)) {
      return {
        ...parsed,
        errors: cloneObservedErrors(parsed.errors),
      }
    }
  }
  catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException
    if (maybeNodeError.code !== 'ENOENT') {
      console.warn(`Nepodarilo sa načítať lokálny error log: ${maybeNodeError.message}`)
    }
  }

  const seedState = createSeedErrorLogState()
  await writeLocalErrorLogState(seedState, filePath)

  return seedState
}

export async function writeLocalErrorLogState(
  state: ErrorLogState,
  filePath = resolveLocalErrorLogStorePath(),
): Promise<LocalErrorLogState> {
  const nextState: LocalErrorLogState = {
    errors: cloneObservedErrors(state.errors),
    updatedAt: new Date().toISOString(),
    version: 1,
  }

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8')

  return nextState
}

export async function appendLocalObservedError(
  input: ObservedErrorInput,
  filePath = resolveLocalErrorLogStorePath(),
): Promise<StoredObservedErrorAppend> {
  const currentState = await readLocalErrorLogState(filePath)
  const error = createObservedErrorEntry(input, currentState.errors)
  const state = await writeLocalErrorLogState(
    {
      errors: [error, ...currentState.errors].slice(0, 300),
    },
    filePath,
  )

  return {
    error,
    state,
  }
}
