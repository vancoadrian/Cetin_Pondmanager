import type { Tournament } from '~/data/pond'

export interface TournamentTeamAccessSummary {
  code: string
  codeUrl: string
  hasAssignedTeam: boolean
  sectorId: string
  sectorLabel: string
  teamName: string
  title: string
  url: string
}

export function createTournamentTeamAccessUrl(tournamentId: string, sectorId: string) {
  const params = new URLSearchParams({
    sektor: sectorId,
    turnaj: tournamentId,
  })

  return `/sutaze/tim?${params.toString()}`
}

export function normalizeTournamentTeamAccessCode(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()
}

export function createTournamentTeamAccessCode(tournamentId: string, sectorId: string) {
  return [normalizeTournamentTeamAccessCode(tournamentId), normalizeTournamentTeamAccessCode(sectorId)]
    .filter(Boolean)
    .join('-')
}

export function createTournamentTeamAccessCodeUrl(code: string) {
  const params = new URLSearchParams({
    kod: normalizeTournamentTeamAccessCode(code),
  })

  return `/sutaze/tim?${params.toString()}`
}

export function resolveTournamentTeamAccessCode(
  tournaments: Array<Pick<Tournament, 'id' | 'sectors'>>,
  code: string | null | undefined,
) {
  const normalizedCode = normalizeTournamentTeamAccessCode(code ?? '')
  if (!normalizedCode) return undefined

  for (const tournament of tournaments) {
    for (const sector of tournament.sectors) {
      if (createTournamentTeamAccessCode(tournament.id, sector.id) === normalizedCode) {
        return {
          sectorId: sector.id,
          tournamentId: tournament.id,
        }
      }
    }
  }

  return undefined
}

export function getTournamentTeamAccessSummary(
  tournament: Pick<Tournament, 'id' | 'sectors'>,
  sectorId: string,
): TournamentTeamAccessSummary {
  const sector = tournament.sectors.find((item) => item.id === sectorId)
  const sectorLabel = sector?.label ?? sectorId
  const teamName = sector?.team?.trim() || 'Nepriradený tím'
  const code = createTournamentTeamAccessCode(tournament.id, sectorId)

  return {
    code,
    codeUrl: createTournamentTeamAccessCodeUrl(code),
    hasAssignedTeam: Boolean(sector?.team?.trim()),
    sectorId,
    sectorLabel,
    teamName,
    title: `${sectorLabel} · ${teamName}`,
    url: createTournamentTeamAccessUrl(tournament.id, sectorId),
  }
}

export function getTournamentTeamAccessRows(tournament: Pick<Tournament, 'id' | 'sectors'>) {
  return tournament.sectors.map((sector) => getTournamentTeamAccessSummary(tournament, sector.id))
}

function escapeCsvValue(value: string) {
  if (!/[",\n\r]/.test(value)) return value

  return `"${value.replace(/"/g, '""')}"`
}

export function createTournamentTeamAccessCsv(
  tournament: Pick<Tournament, 'id' | 'sectors'>,
  baseUrl = '',
) {
  const rows = getTournamentTeamAccessRows(tournament)
  const header = ['sektor', 'tim', 'kod', 'odkaz']

  return [
    header.join(','),
    ...rows.map((row) =>
      [
        row.sectorLabel,
        row.teamName,
        row.code,
        `${baseUrl}${row.codeUrl}`,
      ].map(escapeCsvValue).join(','),
    ),
  ].join('\n')
}
