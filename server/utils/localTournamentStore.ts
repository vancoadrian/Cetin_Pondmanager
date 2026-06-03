import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type {
  Tournament,
  TournamentCatch,
  TournamentMarshal,
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

export interface LocalTournamentState extends TournamentWorkflowState {
  updatedAt: string
  version: 1
}

export function resolveLocalTournamentStorePath() {
  return process.env.RYBOLOV_LOCAL_TOURNAMENT_STORE
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'tournament-state.json')
}

function cloneTournaments(items: Tournament[]) {
  return items.map((tournament) => ({
    ...tournament,
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
  }
}

export async function readLocalTournamentState(
  filePath = resolveLocalTournamentStorePath(),
): Promise<LocalTournamentState> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)

    if (isTournamentState(parsed)) {
      return normalizeLocalTournamentState(parsed)
    }
  }
  catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException
    if (maybeNodeError.code !== 'ENOENT') {
      console.warn(`Nepodarilo sa načítať lokálny stav súťaží: ${maybeNodeError.message}`)
    }
  }

  const seedState = createSeedTournamentState()
  await writeLocalTournamentState(seedState, filePath)

  return seedState
}

export async function writeLocalTournamentState(
  state: TournamentWorkflowState,
  filePath = resolveLocalTournamentStorePath(),
): Promise<LocalTournamentState> {
  const nextState: LocalTournamentState = {
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

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8')

  return nextState
}

export async function appendLocalTournamentRequest(
  request: TournamentRequest,
  filePath = resolveLocalTournamentStorePath(),
): Promise<LocalTournamentState> {
  const currentState = await readLocalTournamentState(filePath)

  return writeLocalTournamentState(
    {
      tournamentCatches: currentState.tournamentCatches,
      tournamentMarshals: currentState.tournamentMarshals,
      tournamentPenalties: currentState.tournamentPenalties,
      tournamentRequests: [request, ...currentState.tournamentRequests],
      tournamentRuleChecks: currentState.tournamentRuleChecks,
      tournamentTeamRegistrations: currentState.tournamentTeamRegistrations,
      tournaments: currentState.tournaments,
    },
    filePath,
  )
}

export async function appendLocalTournamentTeamRegistration(
  registration: TournamentTeamRegistration,
  filePath = resolveLocalTournamentStorePath(),
): Promise<LocalTournamentState> {
  const currentState = await readLocalTournamentState(filePath)

  return writeLocalTournamentState(
    {
      tournamentCatches: currentState.tournamentCatches,
      tournamentMarshals: currentState.tournamentMarshals,
      tournamentPenalties: currentState.tournamentPenalties,
      tournamentRequests: currentState.tournamentRequests,
      tournamentRuleChecks: currentState.tournamentRuleChecks,
      tournamentTeamRegistrations: [registration, ...currentState.tournamentTeamRegistrations],
      tournaments: currentState.tournaments,
    },
    filePath,
  )
}
