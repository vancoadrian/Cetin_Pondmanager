import type { Tournament, TournamentCatch } from '~/data/pond'

export interface TournamentLeaderboardRow {
  catchDerivedWeightKg: number
  disputedCatchCount: number
  disputedWeightKg: number
  largestCatchKg: number
  largestCatchSpecies?: string
  latestCatchAt?: string
  pendingCatchCount: number
  pendingWeightKg: number
  rank: number
  scoreWeightKg: number
  sectorId: string
  sectorLabel: string
  team: string
  verifiedCatchCount: number
  verifiedWeightKg: number
}

export interface TournamentLeaderboardStats {
  activeTeamCount: number
  leadingRow?: TournamentLeaderboardRow
  pendingReviewCatchCount: number
  totalScoreWeightKg: number
  totalVerifiedCatchCount: number
}

export interface TournamentLeaderboardFeed {
  generatedAt: string
  ok: true
  rows: TournamentLeaderboardRow[]
  stats: TournamentLeaderboardStats
  tournament: Pick<Tournament, 'dateRange' | 'id' | 'lake' | 'name' | 'status'>
}

function roundWeight(value: number) {
  return Number(value.toFixed(1))
}

function csvCell(value: string | number | undefined) {
  const rawValue = value ?? ''
  const stringValue = typeof rawValue === 'number'
    ? rawValue.toLocaleString('sk-SK', { maximumFractionDigits: 1 })
    : rawValue

  if (/[;"\n\r]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`
  }

  return stringValue
}

function catchesForSector(catches: TournamentCatch[], tournamentId: string, sectorId: string) {
  return catches.filter((catchItem) =>
    catchItem.tournamentId === tournamentId && catchItem.sectorId === sectorId,
  )
}

function weightByStatus(catches: TournamentCatch[], status: TournamentCatch['status']) {
  return roundWeight(
    catches
      .filter((catchItem) => catchItem.status === status)
      .reduce((sum, catchItem) => sum + catchItem.weightKg, 0),
  )
}

function rankKey(row: TournamentLeaderboardRow) {
  return `${row.scoreWeightKg}:${row.largestCatchKg}:${row.verifiedCatchCount}`
}

export function getTournamentLeaderboard(
  tournament: Tournament,
  catches: TournamentCatch[],
): TournamentLeaderboardRow[] {
  const rows = tournament.sectors.map<TournamentLeaderboardRow>((sector) => {
    const sectorCatches = catchesForSector(catches, tournament.id, sector.id)
    const verifiedWeightKg = weightByStatus(sectorCatches, 'verified')
    const pendingWeightKg = weightByStatus(sectorCatches, 'waiting')
    const disputedWeightKg = weightByStatus(sectorCatches, 'disputed')
    const largestCatch = [...sectorCatches].sort((first, second) => second.weightKg - first.weightKg)[0]

    return {
      catchDerivedWeightKg: roundWeight(verifiedWeightKg + pendingWeightKg + disputedWeightKg),
      disputedCatchCount: sectorCatches.filter((catchItem) => catchItem.status === 'disputed').length,
      disputedWeightKg,
      largestCatchKg: largestCatch?.weightKg ?? 0,
      largestCatchSpecies: largestCatch?.species,
      latestCatchAt: sectorCatches[0]?.caughtAt,
      pendingCatchCount: sectorCatches.filter((catchItem) => catchItem.status === 'waiting').length,
      pendingWeightKg,
      rank: 0,
      scoreWeightKg: roundWeight(sector.weightKg),
      sectorId: sector.id,
      sectorLabel: sector.label,
      team: sector.team ?? 'Voľný sektor',
      verifiedCatchCount: sectorCatches.filter((catchItem) => catchItem.status === 'verified').length,
      verifiedWeightKg,
    }
  })

  const sortedRows = rows.sort((first, second) =>
    second.scoreWeightKg - first.scoreWeightKg
    || second.largestCatchKg - first.largestCatchKg
    || second.verifiedCatchCount - first.verifiedCatchCount
    || first.sectorLabel.localeCompare(second.sectorLabel, 'sk'),
  )

  let previousKey = ''
  let previousRank = 0

  return sortedRows.map((row, index) => {
    const currentKey = rankKey(row)
    const rank = currentKey === previousKey ? previousRank : index + 1

    previousKey = currentKey
    previousRank = rank

    return {
      ...row,
      rank,
    }
  })
}

export function getTournamentLeaderboardStats(rows: TournamentLeaderboardRow[]): TournamentLeaderboardStats {
  return {
    activeTeamCount: rows.filter((row) =>
      row.scoreWeightKg > 0 || row.verifiedCatchCount + row.pendingCatchCount + row.disputedCatchCount > 0,
    ).length,
    leadingRow: rows[0],
    pendingReviewCatchCount: rows.reduce((sum, row) => sum + row.pendingCatchCount + row.disputedCatchCount, 0),
    totalScoreWeightKg: roundWeight(rows.reduce((sum, row) => sum + row.scoreWeightKg, 0)),
    totalVerifiedCatchCount: rows.reduce((sum, row) => sum + row.verifiedCatchCount, 0),
  }
}

export function createTournamentLeaderboardFeed(
  tournament: Tournament,
  catches: TournamentCatch[],
  generatedAt = new Date().toISOString(),
): TournamentLeaderboardFeed {
  const rows = getTournamentLeaderboard(tournament, catches)

  return {
    generatedAt,
    ok: true,
    rows,
    stats: getTournamentLeaderboardStats(rows),
    tournament: {
      dateRange: tournament.dateRange,
      id: tournament.id,
      lake: tournament.lake,
      name: tournament.name,
      status: tournament.status,
    },
  }
}

export function createTournamentLeaderboardCsvExport(rows: TournamentLeaderboardRow[]) {
  const header = [
    'Poradie',
    'Sektor',
    'Tím',
    'Skóre kg',
    'Overené úlovky',
    'Overená váha kg',
    'Čakajúce úlovky',
    'Čakajúca váha kg',
    'Sporné úlovky',
    'Sporná váha kg',
    'Najväčší úlovok kg',
    'Najväčší druh',
    'Posledný úlovok',
  ]

  const rowsCsv = rows.map((row) => [
    row.rank,
    row.sectorLabel,
    row.team,
    row.scoreWeightKg,
    row.verifiedCatchCount,
    row.verifiedWeightKg,
    row.pendingCatchCount,
    row.pendingWeightKg,
    row.disputedCatchCount,
    row.disputedWeightKg,
    row.largestCatchKg,
    row.largestCatchSpecies,
    row.latestCatchAt,
  ])

  return [header, ...rowsCsv]
    .map((row) => row.map(csvCell).join(';'))
    .join('\n')
}
