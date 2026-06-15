import type { TournamentTeamAccessSummary } from '~/utils/tournamentTeamAccess'

export const TOURNAMENT_TEAM_SESSION_STORAGE_KEY = 'rybolov_cetin_team_session_v1'

export interface TournamentTeamSession {
  code: string
  createdAt: string
  id: string
  lastSeenAt: string
  sectorId: string
  sectorLabel: string
  teamName: string
  tournamentId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export function createTournamentTeamSession(
  summary: TournamentTeamAccessSummary,
  tournamentId: string,
  now = new Date().toISOString(),
): TournamentTeamSession {
  return {
    code: summary.code,
    createdAt: now,
    id: `${tournamentId}:${summary.sectorId}`,
    lastSeenAt: now,
    sectorId: summary.sectorId,
    sectorLabel: summary.sectorLabel,
    teamName: summary.teamName,
    tournamentId,
  }
}

export function serializeTournamentTeamSession(session: TournamentTeamSession) {
  return JSON.stringify(session)
}

export function parseTournamentTeamSession(value: string | null | undefined): TournamentTeamSession | undefined {
  if (!value) return undefined

  try {
    const parsed: unknown = JSON.parse(value)
    if (!isRecord(parsed)) return undefined

    const session: TournamentTeamSession = {
      code: asString(parsed.code),
      createdAt: asString(parsed.createdAt),
      id: asString(parsed.id),
      lastSeenAt: asString(parsed.lastSeenAt),
      sectorId: asString(parsed.sectorId),
      sectorLabel: asString(parsed.sectorLabel),
      teamName: asString(parsed.teamName),
      tournamentId: asString(parsed.tournamentId),
    }

    if (!session.code || !session.id || !session.sectorId || !session.tournamentId) {
      return undefined
    }

    return session
  }
  catch {
    return undefined
  }
}

export function touchTournamentTeamSession(
  session: TournamentTeamSession,
  now = new Date().toISOString(),
): TournamentTeamSession {
  return {
    ...session,
    lastSeenAt: now,
  }
}

export function isTournamentTeamSessionForSector(
  session: TournamentTeamSession | undefined,
  tournamentId: string,
  sectorId: string,
) {
  return Boolean(
    session
    && session.tournamentId === tournamentId
    && session.sectorId === sectorId,
  )
}
