import { join } from 'node:path'
import type { LakeClosure } from '~/data/pond'
import { lakeClosures } from '~/data/pond'
import type { ClosureWorkflowState } from '~/services/closureApiService'
import {
  guardCorruptRuntimeState,
  readRuntimeDocument,
  writeRuntimeDocument,
} from './runtimeStateStore'

export interface LocalClosureState extends ClosureWorkflowState {
  updatedAt: string
  version: 1
}

const STORE_KEY = 'closure-state'

export function resolveLocalClosureStorePath() {
  return process.env.RYBOLOV_LOCAL_CLOSURE_STORE
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'closure-state.json')
}

export function createSeedClosureState(updatedAt = new Date(0).toISOString()): LocalClosureState {
  return {
    lakeClosures: lakeClosures.map((closure) => ({ ...closure })),
    updatedAt,
    version: 1,
  }
}

function isClosureState(value: unknown): value is LocalClosureState {
  const candidate = value as Partial<LocalClosureState>

  return (
    candidate.version === 1 &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.lakeClosures)
  )
}

export async function readLocalClosureState(
  filePath = resolveLocalClosureStorePath(),
): Promise<LocalClosureState> {
  const document = await readRuntimeDocument(STORE_KEY, filePath)

  if (document.found) {
    const parsed = document.payload
    if (isClosureState(parsed)) {
      return parsed
    }
    guardCorruptRuntimeState(STORE_KEY)
  }

  const seedState = createSeedClosureState()
  await writeLocalClosureState(seedState, filePath)

  return seedState
}

export async function writeLocalClosureState(
  state: ClosureWorkflowState,
  filePath = resolveLocalClosureStorePath(),
): Promise<LocalClosureState> {
  const nextState: LocalClosureState = {
    lakeClosures: state.lakeClosures.map((closure: LakeClosure) => ({ ...closure })),
    updatedAt: new Date().toISOString(),
    version: 1,
  }

  await writeRuntimeDocument(STORE_KEY, filePath, nextState)

  return nextState
}
