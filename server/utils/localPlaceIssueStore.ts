import { join } from 'node:path'
import type { PlaceIssue } from '~/data/pond'
import { placeIssues } from '~/data/pond'
import {
  clonePlaceIssueWorkflowState,
  type PlaceIssueWorkflowState,
} from '~/services/placeIssueService'
import {
  guardCorruptRuntimeState,
  mutateRuntimeDocument,
  readRuntimeDocument,
  writeRuntimeDocument,
} from './runtimeStateStore'

export interface LocalPlaceIssueState extends PlaceIssueWorkflowState {
  updatedAt: string
  version: 1
}

export interface StoredPlaceIssueAppend {
  issue: PlaceIssue
  state: LocalPlaceIssueState
}

const STORE_KEY = 'place-issue-state'

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

function parseLocalPlaceIssueState(payload: unknown): LocalPlaceIssueState | undefined {
  if (!isPlaceIssueState(payload)) return undefined

  return {
    ...payload,
    ...clonePlaceIssueWorkflowState(payload.placeIssues),
  }
}

function composePlaceIssueState(state: PlaceIssueWorkflowState): LocalPlaceIssueState {
  return {
    ...clonePlaceIssueWorkflowState(state.placeIssues),
    updatedAt: new Date().toISOString(),
    version: 1,
  }
}

export async function readLocalPlaceIssueState(
  filePath = resolveLocalPlaceIssueStorePath(),
): Promise<LocalPlaceIssueState> {
  const document = await readRuntimeDocument(STORE_KEY, filePath)

  if (document.found) {
    const parsed = parseLocalPlaceIssueState(document.payload)
    if (parsed) return parsed
    guardCorruptRuntimeState(STORE_KEY)
  }

  const seedState = createSeedPlaceIssueState()
  await writeLocalPlaceIssueState(seedState, filePath)

  return seedState
}

export async function writeLocalPlaceIssueState(
  state: PlaceIssueWorkflowState,
  filePath = resolveLocalPlaceIssueStorePath(),
): Promise<LocalPlaceIssueState> {
  const nextState = composePlaceIssueState(state)
  await writeRuntimeDocument(STORE_KEY, filePath, nextState)

  return nextState
}

export async function appendLocalPlaceIssue(
  issue: PlaceIssue,
  filePath = resolveLocalPlaceIssueStorePath(),
): Promise<StoredPlaceIssueAppend> {
  return mutateRuntimeDocument(STORE_KEY, filePath, async (document) => {
    let currentState: LocalPlaceIssueState | undefined
    if (document.found) {
      currentState = parseLocalPlaceIssueState(document.payload)
      if (!currentState) guardCorruptRuntimeState(STORE_KEY)
    }
    currentState ??= createSeedPlaceIssueState()

    const state = composePlaceIssueState({
      placeIssues: [issue, ...currentState.placeIssues],
    })

    return {
      payload: state,
      result: { issue, state },
    }
  })
}
