import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  cloneLargeFishAssistanceState,
  type LargeFishAssistanceState,
} from '~/services/largeFishAssistanceService'

export interface LocalLargeFishAssistanceState extends LargeFishAssistanceState {
  updatedAt: string
  version: 1
}

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

export async function readLocalLargeFishAssistanceState(
  filePath = resolveLocalLargeFishAssistanceStorePath(),
): Promise<LocalLargeFishAssistanceState> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'))
    if (isLargeFishAssistanceState(parsed)) {
      return {
        ...cloneLargeFishAssistanceState(parsed),
        updatedAt: parsed.updatedAt,
        version: 1,
      }
    }
  }
  catch (error) {
    const maybeError = error as NodeJS.ErrnoException
    if (maybeError.code !== 'ENOENT') {
      console.warn(`Nepodarilo sa načítať privolania správcu: ${maybeError.message}`)
    }
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

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8')
  return nextState
}
