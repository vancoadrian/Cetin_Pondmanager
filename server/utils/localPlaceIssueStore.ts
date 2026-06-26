import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { PlaceIssue } from '~/data/pond'
import { placeIssues } from '~/data/pond'
import {
  clonePlaceIssueWorkflowState,
  type PlaceIssueWorkflowState,
} from '~/services/placeIssueService'

export interface LocalPlaceIssueState extends PlaceIssueWorkflowState {
  updatedAt: string
  version: 1
}

export interface StoredPlaceIssueAppend {
  issue: PlaceIssue
  state: LocalPlaceIssueState
}

export function resolveLocalPlaceIssueStorePath() {
  return process.env.RYBOLOV_LOCAL_PLACE_ISSUE_STORE
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'place-issue-state.json')
}

export function createSeedPlaceIssueState(updatedAt = new Date(0).toISOString()): LocalPlaceIssueState {
  return {
    ...clonePlaceIssueWorkflowState(placeIssues),
    updatedAt,
    version: 1,
  }
}

function isPlaceIssueState(value: unknown): value is LocalPlaceIssueState {
  const candidate = value as Partial<LocalPlaceIssueState>

  return (
    candidate.version === 1 &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.placeIssues)
  )
}

export async function readLocalPlaceIssueState(
  filePath = resolveLocalPlaceIssueStorePath(),
): Promise<LocalPlaceIssueState> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)

    if (isPlaceIssueState(parsed)) {
      return {
        ...parsed,
        ...clonePlaceIssueWorkflowState(parsed.placeIssues),
      }
    }
  }
  catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException
    if (maybeNodeError.code !== 'ENOENT') {
      console.warn(`Nepodarilo sa načítať lokálne hlásenia nedostatkov: ${maybeNodeError.message}`)
    }
  }

  const seedState = createSeedPlaceIssueState()
  await writeLocalPlaceIssueState(seedState, filePath)

  return seedState
}

export async function writeLocalPlaceIssueState(
  state: PlaceIssueWorkflowState,
  filePath = resolveLocalPlaceIssueStorePath(),
): Promise<LocalPlaceIssueState> {
  const nextState: LocalPlaceIssueState = {
    ...clonePlaceIssueWorkflowState(state.placeIssues),
    updatedAt: new Date().toISOString(),
    version: 1,
  }

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8')

  return nextState
}

export async function appendLocalPlaceIssue(
  issue: PlaceIssue,
  filePath = resolveLocalPlaceIssueStorePath(),
): Promise<StoredPlaceIssueAppend> {
  const currentState = await readLocalPlaceIssueState(filePath)
  const state = await writeLocalPlaceIssueState(
    {
      placeIssues: [issue, ...currentState.placeIssues],
    },
    filePath,
  )

  return {
    issue,
    state,
  }
}
