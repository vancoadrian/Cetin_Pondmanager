import { join } from 'node:path'
import {
  cloneLargeFishAssistanceState,
  type LargeFishAssistanceState,
} from '~/services/largeFishAssistanceService'
import {
  guardCorruptRuntimeState,
  readRuntimeDocument,
  writeRuntimeDocument,
} from './runtimeStateStore'

export interface LocalLargeFishAssistanceState extends LargeFishAssistanceState {
  updatedAt: string
  version: 1
}

const STORE_KEY = 'large-fish-assistance-state'

export function resolveLocalLargeFishAssistanceStorePath() {
  return process.env.RYBOLOV_LOCAL_LARGE_FISH_ASSISTANCE_STORE
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'large-fish-assistance-state.json')
}

export function createEmptyLargeFishAssistanceState(
  updatedAt = new Date(0).toISOString(),
): LocalLargeFishAssistanceState {
  return {
    requests: [],
    updatedAt,
    version: 1,
  }
}

function isLargeFishAssistanceState(value: unknown): value is LocalLargeFishAssistanceState {
  const candidate = value as Partial<LocalLargeFishAssistanceState>
  return candidate.version === 1
    && typeof candidate.updatedAt === 'string'
    && Array.isArray(candidate.requests)
}

function parseLocalLargeFishAssistanceState(payload: unknown): LocalLargeFishAssistanceState | undefined {
  if (!isLargeFishAssistanceState(payload)) return undefined

  return {
    ...cloneLargeFishAssistanceState(payload),
    updatedAt: payload.updatedAt,
    version: 1,
  }
}

export async function readLocalLargeFishAssistanceState(
  filePath = resolveLocalLargeFishAssistanceStorePath(),
): Promise<LocalLargeFishAssistanceState> {
  const document = await readRuntimeDocument(STORE_KEY, filePath)

  if (document.found) {
    const parsed = parseLocalLargeFishAssistanceState(document.payload)
    if (parsed) return parsed
    guardCorruptRuntimeState(STORE_KEY)
  }

  const state = createEmptyLargeFishAssistanceState()
  await writeLocalLargeFishAssistanceState(state, filePath)
  return state
}

export async function writeLocalLargeFishAssistanceState(
  state: LargeFishAssistanceState,
  filePath = resolveLocalLargeFishAssistanceStorePath(),
): Promise<LocalLargeFishAssistanceState> {
  const nextState: LocalLargeFishAssistanceState = {
    ...cloneLargeFishAssistanceState(state),
    updatedAt: new Date().toISOString(),
    version: 1,
  }

  await writeRuntimeDocument(STORE_KEY, filePath, nextState)
  return nextState
}
