import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { LakeClosure } from '~/data/pond'
import { lakeClosures } from '~/data/pond'
import type { ClosureWorkflowState } from '~/services/closureApiService'

export interface LocalClosureState extends ClosureWorkflowState {
  updatedAt: string
  version: 1
}

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
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)

    if (isClosureState(parsed)) {
      return parsed
    }
  }
  catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException
    if (maybeNodeError.code !== 'ENOENT') {
      console.warn(`Nepodarilo sa načítať lokálny stav uzávierok: ${maybeNodeError.message}`)
    }
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

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8')

  return nextState
}
