import { join } from 'node:path'
import type {
  Tournament,
  TournamentCatch,
  TournamentMarshal,
  TournamentOperationsMode,
  TournamentPenalty,
  TournamentRequest,
  TournamentRuleCheck,
  TournamentTeamRegistration,
} from '~/data/pond'
import {
  tournamentCatches,
  tournamentMarshals,
  tournamentPenalties,
  tournamentRequests,
  tournamentRuleChecks,
  tournamentTeamRegistrations,
  tournaments,
} from '~/data/pond'
import type { TournamentWorkflowState } from '~/services/tournamentApiService'
import {
  guardCorruptRuntimeState,
  mutateRuntimeDocument,
  readRuntimeDocument,
  writeRuntimeDocument,
} from './runtimeStateStore'

export interface LocalTournamentState extends TournamentWorkflowState {
  updatedAt: string
  version: 1
}

const STORE_KEY = 'tournament-state'

export function resolveLocalTournamentStorePath() {
  return process.env.RYBOLOV_LOCAL_TOURNAMENT_STORE
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'tournament-state.json')
}

function cloneTournaments(items: Tournament[]) {
  return items.map((tournament) => ({
    ...tournament,
    operationsMode: ((tournament as Tournament & { operationsMode?: TournamentOperationsMode }).operationsMode ?? 'full-dispatch'),
    sectors: tournament.sectors.map((sector) => ({ ...sector })),
  }))
}

function cloneMarshals(items: TournamentMarshal[]) {
  return items.map((marshal) => ({
    ...marshal,
    assignedSectorIds: [...marshal.assignedSectorIds],
  }))
}

function cloneRequests(items: TournamentRequest[]) {
  return items.map((request) => ({ ...request }))
}

function cloneCatches(items: TournamentCatch[]) {
  return items.map((catchItem) => ({ ...catchItem }))
}

function clonePenalties(items: TournamentPenalty[]) {
  return items.map((penalty) => ({ ...penalty }))
}

function cloneChecks(items: TournamentRuleCheck[]) {
  return items.map((check) => ({ ...check }))
}

function cloneTeamRegistrations(items: TournamentTeamRegistration[]) {
  return items.map((registration) => ({ ...registration }))
}

export function createSeedTournamentState(updatedAt = new Date(0).toISOString()): LocalTournamentState {
  return {
    tournamentCatches: cloneCatches(tournamentCatches),
    tournamentMarshals: cloneMarshals(tournamentMarshals),
    tournamentPenalties: clonePenalties(tournamentPenalties),
    tournamentRequests: cloneRequests(tournamentRequests),
    tournamentRuleChecks: cloneChecks(tournamentRuleChecks),
    tournamentTeamRegistrations: cloneTeamRegistrations(tournamentTeamRegistrations),
    tournaments: cloneTournaments(tournaments),
    updatedAt,
    version: 1,
  }
}

function isTournamentState(value: unknown): value is LocalTournamentState {
  const candidate = value as Partial<LocalTournamentState>

  return (
    candidate.version === 1 &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.tournamentCatches) &&
    Array.isArray(candidate.tournamentMarshals) &&
    Array.isArray(candidate.tournamentPenalties) &&
    Array.isArray(candidate.tournamentRequests) &&
    Array.isArray(candidate.tournamentRuleChecks) &&
    Array.isArray(candidate.tournaments)
  )
}

function normalizeLocalTournamentState(value: LocalTournamentState): LocalTournamentState {
  return {
    ...value,
    tournamentTeamRegistrations: Array.isArray(value.tournamentTeamRegistrations)
      ? value.tournamentTeamRegistrations
      : cloneTeamRegistrations(tournamentTeamRegistrations),
    tournaments: cloneTournaments(value.tournaments),
  }
}

function parseLocalTournamentState(payload: unknown): LocalTournamentState | undefined {
  if (!isTournamentState(payload)) return undefined

  return normalizeLocalTournamentState(payload)
}

function composeTournamentState(state: TournamentWorkflowState): LocalTournamentState {
  return {
    tournamentCatches: cloneCatches(state.tournamentCatches),
    tournamentMarshals: cloneMarshals(state.tournamentMarshals),
    tournamentPenalties: clonePenalties(state.tournamentPenalties),
    tournamentRequests: cloneRequests(state.tournamentRequests),
    tournamentRuleChecks: cloneChecks(state.tournamentRuleChecks),
    tournamentTeamRegistrations: cloneTeamRegistrations(state.tournamentTeamRegistrations),
    tournaments: cloneTournaments(state.tournaments),
    updatedAt: new Date().toISOString(),
    version: 1,
  }
}

export async function readLocalTournamentState(
  filePath = resolveLocalTournamentStorePath(),
): Promise<LocalTournamentState> {
  const document = await readRuntimeDocument(STORE_KEY, filePath)

  if (document.found) {
    const parsed = parseLocalTournamentState(document.payload)
    if (parsed) return parsed
    guardCorruptRuntimeState(STORE_KEY)
  }

  const seedState = createSeedTournamentState()
  await writeLocalTournamentState(seedState, filePath)

  return seedState
}

export async function writeLocalTournamentState(
  state: TournamentWorkflowState,
  filePath = resolveLocalTournamentStorePath(),
): Promise<LocalTournamentState> {
  const nextState = composeTournamentState(state)
  await writeRuntimeDocument(STORE_KEY, filePath, nextState)

  return nextState
}

export async function appendLocalTournamentRequest(
  request: TournamentRequest,
  filePath = resolveLocalTournamentStorePath(),
): Promise<LocalTournamentState> {
  return mutateRuntimeDocument(STORE_KEY, filePath, async (document) => {
    let currentState: LocalTournamentState | undefined
    if (document.found) {
      currentState = parseLocalTournamentState(document.payload)
      if (!currentState) guardCorruptRuntimeState(STORE_KEY)
    }
    currentState ??= createSeedTournamentState()

    const state = composeTournamentState({
      tournamentCatches: currentState.tournamentCatches,
      tournamentMarshals: currentState.tournamentMarshals,
      tournamentPenalties: currentState.tournamentPenalties,
      tournamentRequests: [request, ...currentState.tournamentRequests],
      tournamentRuleChecks: currentState.tournamentRuleChecks,
      tournamentTeamRegistrations: currentState.tournamentTeamRegistrations,
      tournaments: currentState.tournaments,
    })

    return {
      payload: state,
      result: state,
    }
  })
}

export async function appendLocalTournamentTeamRegistration(
  registration: TournamentTeamRegistration,
  filePath = resolveLocalTournamentStorePath(),
): Promise<LocalTournamentState> {
  return mutateRuntimeDocument(STORE_KEY, filePath, async (document) => {
    let currentState: LocalTournamentState | undefined
    if (document.found) {
      currentState = parseLocalTournamentState(document.payload)
      if (!currentState) guardCorruptRuntimeState(STORE_KEY)
    }
    currentState ??= createSeedTournamentState()

    const state = composeTournamentState({
      tournamentCatches: currentState.tournamentCatches,
      tournamentMarshals: currentState.tournamentMarshals,
      tournamentPenalties: currentState.tournamentPenalties,
      tournamentRequests: currentState.tournamentRequests,
      tournamentRuleChecks: currentState.tournamentRuleChecks,
      tournamentTeamRegistrations: [registration, ...currentState.tournamentTeamRegistrations],
      tournaments: currentState.tournaments,
    })

    return {
      payload: state,
      result: state,
    }
  })
}
