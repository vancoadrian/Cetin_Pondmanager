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
  tournamentMarshalStatusLabels,
  tournamentPenaltyTypeLabels,
  tournamentRequestStatusLabels,
  tournamentRequestTypeLabels,
  tournamentTeamRegistrationStatusLabels,
} from '~/data/pond'
import {
  getTournamentLeaderboard,
  getTournamentLeaderboardStats,
} from '~/utils/tournamentLeaderboard'

export interface TournamentOrganizerExportState {
  tournamentCatches: TournamentCatch[]
  tournamentMarshals: TournamentMarshal[]
  tournamentPenalties: TournamentPenalty[]
  tournamentRequests: TournamentRequest[]
  tournamentRuleChecks: TournamentRuleCheck[]
  tournamentTeamRegistrations: TournamentTeamRegistration[]
}

const catchStatusLabels: Record<TournamentCatch['status'], string> = {
  disputed: 'sporné',
  verified: 'overené',
  waiting: 'čaká',
}

const penaltyStatusLabels: Record<TournamentPenalty['status'], string> = {
  active: 'aktívny',
  appealed: 'odvolanie',
  served: 'odslúžený',
}

const ruleCheckResultLabels: Record<TournamentRuleCheck['result'], string> = {
  ok: 'OK',
  penalty: 'trest',
  warning: 'napomenutie',
}

function roundWeight(value: number) {
  return Number(value.toFixed(1))
}

function csvCell(value: boolean | number | string | undefined | null) {
  const rawValue = value ?? ''
  const stringValue = typeof rawValue === 'number'
    ? rawValue.toLocaleString('sk-SK', { maximumFractionDigits: 1 })
    : String(rawValue)

  if (/[;"\n\r]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`
  }

  return stringValue
}

function csvRow(values: Array<boolean | number | string | undefined | null>) {
  return values.map(csvCell).join(';')
}

function section(
  title: string,
  header: Array<boolean | number | string | undefined | null>,
  rows: Array<Array<boolean | number | string | undefined | null>>,
) {
  return [
    csvRow([]),
    csvRow([title]),
    csvRow(header),
    ...rows.map(csvRow),
  ]
}

export function createTournamentOrganizerCsvExport(
  tournament: Tournament,
  state: TournamentOrganizerExportState,
  generatedAt = new Date().toISOString(),
) {
  const leaderboardRows = getTournamentLeaderboard(tournament, state.tournamentCatches)
  const leaderboardStats = getTournamentLeaderboardStats(leaderboardRows)
  const tournamentCatches = state.tournamentCatches.filter((catchItem) => catchItem.tournamentId === tournament.id)
  const tournamentPenalties = state.tournamentPenalties.filter((penalty) => penalty.tournamentId === tournament.id)
  const tournamentRequests = state.tournamentRequests.filter((request) => request.tournamentId === tournament.id)
  const tournamentRuleChecks = state.tournamentRuleChecks.filter((check) => check.tournamentId === tournament.id)
  const tournamentTeamRegistrations = state.tournamentTeamRegistrations.filter((registration) =>
    registration.tournamentId === tournament.id,
  )
  const sectorLabelById = new Map(tournament.sectors.map((sector) => [sector.id, sector.label]))
  const sectorTeamById = new Map(tournament.sectors.map((sector) => [sector.id, sector.team ?? 'Voľný sektor']))
  const marshalById = new Map(state.tournamentMarshals.map((marshal) => [marshal.id, marshal]))

  const sectorLabel = (sectorId?: string) =>
    sectorId ? sectorLabelById.get(sectorId) ?? sectorId.toUpperCase() : ''
  const sectorTeam = (sectorId: string) =>
    sectorTeamById.get(sectorId) ?? sectorLabel(sectorId)
  const marshalName = (marshalId?: string) =>
    marshalId ? marshalById.get(marshalId)?.name ?? marshalId : ''

  const lines = [
    csvRow(['Rybolov Cetín - organizačný export súťaže']),
    csvRow(['Súťaž', tournament.name]),
    csvRow(['Termín', tournament.dateRange]),
    csvRow(['Stav', tournament.status]),
    csvRow(['Generované', generatedAt]),
    csvRow(['Celkové skóre kg', leaderboardStats.totalScoreWeightKg]),
    csvRow(['Overené úlovky', leaderboardStats.totalVerifiedCatchCount]),
    csvRow(['Čaká/sporné na kontrolu', leaderboardStats.pendingReviewCatchCount]),
    ...section(
      'Výsledkovka',
      [
        'Poradie',
        'Sektor',
        'Tím',
        'Skóre kg',
        'Overené úlovky',
        'Overená váha kg',
        'Čaká',
        'Sporné',
        'Najväčší úlovok kg',
        'Najväčší druh',
      ],
      leaderboardRows.map((row) => [
        row.rank,
        row.sectorLabel,
        row.team,
        row.scoreWeightKg,
        row.verifiedCatchCount,
        row.verifiedWeightKg,
        row.pendingCatchCount,
        row.disputedCatchCount,
        row.largestCatchKg,
        row.largestCatchSpecies,
      ]),
    ),
    ...section(
      'Váženia úlovkov',
      [
        'Sektor',
        'Tím',
        'Druh',
        'Váha kg',
        'Miera cm',
        'Chytené',
        'Merané',
        'Stav',
        'Kontrolór',
        'Fotka',
        'Poznámka',
      ],
      tournamentCatches.map((catchItem) => [
        sectorLabel(catchItem.sectorId),
        catchItem.team,
        catchItem.species,
        catchItem.weightKg,
        catchItem.lengthCm,
        catchItem.caughtAt,
        catchItem.measuredAt,
        catchStatusLabels[catchItem.status],
        marshalName(catchItem.verifiedByMarshalId),
        catchItem.photoLabel,
        catchItem.notes,
      ]),
    ),
    ...section(
      'Tresty',
      [
        'Sektor',
        'Tím',
        'Typ',
        'Stav',
        'Kontrolór',
        'Vydané',
        'Začiatok',
        'Koniec',
        'Trvanie h',
        'O prútov',
        'Dôvod',
      ],
      tournamentPenalties.map((penalty) => [
        sectorLabel(penalty.sectorId),
        penalty.team,
        tournamentPenaltyTypeLabels[penalty.type],
        penaltyStatusLabels[penalty.status],
        marshalName(penalty.issuedByMarshalId),
        penalty.issuedAt,
        penalty.startsAt,
        penalty.endsAt,
        penalty.durationHours,
        penalty.rodsLess,
        penalty.reason,
      ]),
    ),
    ...section(
      'Hlásenia tímov',
      [
        'Sektor',
        'Tím',
        'Typ',
        'Priorita',
        'Stav',
        'Vytvorené',
        'Kontrolór',
        'Popis',
      ],
      tournamentRequests.map((request) => [
        sectorLabel(request.sectorId),
        request.team,
        tournamentRequestTypeLabels[request.type],
        request.priority,
        tournamentRequestStatusLabels[request.status],
        request.createdAt,
        marshalName(request.assignedMarshalId),
        request.description,
      ]),
    ),
    ...section(
      'Kontroly sektorov',
      [
        'Sektor',
        'Tím',
        'Kontrolór',
        'Čas',
        'Výsledok',
        'Poznámka',
      ],
      tournamentRuleChecks.map((check) => [
        sectorLabel(check.sectorId),
        sectorTeam(check.sectorId),
        marshalName(check.marshalId),
        check.checkedAt,
        ruleCheckResultLabels[check.result],
        check.note,
      ]),
    ),
    ...section(
      'Prihlášky tímov',
      [
        'Tím',
        'Stav',
        'Kontakt',
        'Telefón',
        'E-mail',
        'Mesto',
        'Členovia',
        'Preferovaný sektor',
        'Priradený sektor',
        'Vytvorené',
        'Posúdené',
        'Poznámka tímu',
        'Poznámka organizátora',
      ],
      tournamentTeamRegistrations.map((registration) => [
        registration.teamName,
        tournamentTeamRegistrationStatusLabels[registration.status],
        registration.contactName,
        registration.contactPhone,
        registration.contactEmail,
        registration.city,
        registration.memberCount,
        sectorLabel(registration.preferredSectorId),
        sectorLabel(registration.assignedSectorId),
        registration.createdAt,
        registration.reviewedAt,
        registration.note,
        registration.reviewNote,
      ]),
    ),
    ...section(
      'Kontrolóri',
      [
        'Meno',
        'Telefón',
        'Stav',
        'Pridelené sektory',
      ],
      state.tournamentMarshals.map((marshal) => [
        marshal.name,
        marshal.phone,
        tournamentMarshalStatusLabels[marshal.status],
        marshal.assignedSectorIds.map(sectorLabel).join(', '),
      ]),
    ),
  ]

  return lines.join('\n')
}

export function summarizeTournamentOrganizerExport(
  tournament: Tournament,
  state: TournamentOrganizerExportState,
) {
  const tournamentCatches = state.tournamentCatches.filter((catchItem) => catchItem.tournamentId === tournament.id)
  const tournamentPenalties = state.tournamentPenalties.filter((penalty) => penalty.tournamentId === tournament.id)
  const tournamentRequests = state.tournamentRequests.filter((request) => request.tournamentId === tournament.id)
  const tournamentTeamRegistrations = state.tournamentTeamRegistrations.filter((registration) =>
    registration.tournamentId === tournament.id,
  )

  return {
    catchCount: tournamentCatches.length,
    penaltyCount: tournamentPenalties.length,
    requestCount: tournamentRequests.length,
    registrationCount: tournamentTeamRegistrations.length,
    sectorCount: tournament.sectors.length,
    totalCatchWeightKg: roundWeight(tournamentCatches.reduce((sum, catchItem) => sum + catchItem.weightKg, 0)),
  }
}
