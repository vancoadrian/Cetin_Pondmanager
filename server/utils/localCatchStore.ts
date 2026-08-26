import { join } from 'node:path'
import type { CatchPhoto, CatchRecord, TripLogbook, TripLogbookEntry } from '~/data/pond'
import { catches, catchPhotos, tripLogbookEntries, tripLogbooks } from '~/data/pond'
import type { CatchWorkflowState } from '~/services/catchApiService'
import {
  guardCorruptRuntimeState,
  mutateRuntimeDocument,
  readRuntimeDocument,
  writeRuntimeDocument,
} from './runtimeStateStore'

export interface LocalCatchState extends CatchWorkflowState {
  updatedAt: string
  version: 1
}

type MaybeLegacyCatchRecord = Omit<CatchRecord, 'status'> & {
  status?: CatchRecord['status']
}

const STORE_KEY = 'catch-state'

export function resolveLocalCatchStorePath() {
  return process.env.RYBOLOV_LOCAL_CATCH_STORE
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'catch-state.json')
}

function cloneCatches(items: MaybeLegacyCatchRecord[]): CatchRecord[] {
  const seedWeatherByCatchId = new Map(catches.map((catchItem) => [catchItem.id, catchItem.weather]))

  return items.map((item) => ({
    ...item,
    status: item.status ?? 'approved',
    weather: item.weather ?? seedWeatherByCatchId.get(item.id),
  }))
}

function cloneCatchPhotos(items: CatchPhoto[] = []) {
  return items.map((item) => ({ ...item }))
}

function cloneTripLogbooks(items: TripLogbook[]) {
  const seedLogbookById = new Map(tripLogbooks.map((item) => [item.id, item]))

  return items.map((item) => ({
    ...item,
    members: item.members.map((member) => {
      const seedMember = seedLogbookById.get(item.id)?.members.find((seed) =>
        seed.id === member.id || (seed.name === member.name && seed.role === member.role),
      )

      return {
        ...member,
        userId: member.userId ?? (member.name === seedMember?.name ? seedMember.userId : undefined),
      }
    }),
    ownerUserId: item.ownerUserId
      ?? (item.owner === seedLogbookById.get(item.id)?.owner
        ? seedLogbookById.get(item.id)?.ownerUserId
        : undefined),
    pegIds: [...item.pegIds],
  }))
}

function cloneTripLogbookEntries(items: TripLogbookEntry[]) {
  return items.map((item) => ({ ...item }))
}

export function createSeedCatchState(updatedAt = new Date(0).toISOString()): LocalCatchState {
  return {
    catchPhotos: cloneCatchPhotos(catchPhotos),
    catches: cloneCatches(catches),
    tripLogbookEntries: cloneTripLogbookEntries(tripLogbookEntries),
    tripLogbooks: cloneTripLogbooks(tripLogbooks),
    updatedAt,
    version: 1,
  }
}

function isCatchState(value: unknown): value is LocalCatchState {
  const candidate = value as Partial<LocalCatchState>

  return (
    candidate.version === 1 &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.catches) &&
    (candidate.catchPhotos === undefined || Array.isArray(candidate.catchPhotos)) &&
    Array.isArray(candidate.tripLogbookEntries) &&
    Array.isArray(candidate.tripLogbooks)
  )
}

function parseLocalCatchState(payload: unknown): LocalCatchState | undefined {
  if (!isCatchState(payload)) return undefined

  return {
    ...payload,
    catchPhotos: cloneCatchPhotos(payload.catchPhotos),
    catches: cloneCatches(payload.catches),
    tripLogbookEntries: cloneTripLogbookEntries(payload.tripLogbookEntries),
    tripLogbooks: cloneTripLogbooks(payload.tripLogbooks),
  }
}

function composeCatchState(state: CatchWorkflowState): LocalCatchState {
  return {
    catchPhotos: cloneCatchPhotos(state.catchPhotos),
    catches: cloneCatches(state.catches),
    tripLogbookEntries: cloneTripLogbookEntries(state.tripLogbookEntries),
    tripLogbooks: cloneTripLogbooks(state.tripLogbooks),
    updatedAt: new Date().toISOString(),
    version: 1,
  }
}

export async function readLocalCatchState(filePath = resolveLocalCatchStorePath()): Promise<LocalCatchState> {
  const document = await readRuntimeDocument(STORE_KEY, filePath)

  if (document.found) {
    const parsed = parseLocalCatchState(document.payload)
    if (parsed) return parsed
    guardCorruptRuntimeState(STORE_KEY)
  }

  const seedState = createSeedCatchState()
  await writeLocalCatchState(seedState, filePath)

  return seedState
}

export async function writeLocalCatchState(
  state: CatchWorkflowState,
  filePath = resolveLocalCatchStorePath(),
): Promise<LocalCatchState> {
  const nextState = composeCatchState(state)
  await writeRuntimeDocument(STORE_KEY, filePath, nextState)

  return nextState
}

export async function appendLocalCatch(
  catchRecord: CatchRecord,
  logbookEntry?: TripLogbookEntry,
  catchPhoto?: CatchPhoto,
  filePath = resolveLocalCatchStorePath(),
): Promise<LocalCatchState> {
  return mutateRuntimeDocument(STORE_KEY, filePath, async (document) => {
    let currentState: LocalCatchState | undefined
    if (document.found) {
      currentState = parseLocalCatchState(document.payload)
      if (!currentState) guardCorruptRuntimeState(STORE_KEY)
    }
    currentState ??= createSeedCatchState()

    const state = composeCatchState({
      catchPhotos: catchPhoto
        ? [catchPhoto, ...currentState.catchPhotos]
        : currentState.catchPhotos,
      catches: [catchRecord, ...currentState.catches],
      tripLogbookEntries: logbookEntry
        ? [logbookEntry, ...currentState.tripLogbookEntries]
        : currentState.tripLogbookEntries,
      tripLogbooks: currentState.tripLogbooks,
    })

    return {
      payload: state,
      result: state,
    }
  })
}

export async function appendLocalTripLogbook(
  logbook: TripLogbook,
  filePath = resolveLocalCatchStorePath(),
): Promise<LocalCatchState> {
  return mutateRuntimeDocument(STORE_KEY, filePath, async (document) => {
    let currentState: LocalCatchState | undefined
    if (document.found) {
      currentState = parseLocalCatchState(document.payload)
      if (!currentState) guardCorruptRuntimeState(STORE_KEY)
    }
    currentState ??= createSeedCatchState()

    const state = composeCatchState({
      catchPhotos: currentState.catchPhotos,
      catches: currentState.catches,
      tripLogbookEntries: currentState.tripLogbookEntries,
      tripLogbooks: [logbook, ...currentState.tripLogbooks],
    })

    return {
      payload: state,
      result: state,
    }
  })
}

export async function replaceLocalCatchState(
  state: CatchWorkflowState,
  filePath = resolveLocalCatchStorePath(),
): Promise<LocalCatchState> {
  return writeLocalCatchState(state, filePath)
}
