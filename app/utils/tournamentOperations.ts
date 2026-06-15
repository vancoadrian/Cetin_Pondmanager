import type { Tournament, TournamentOperationsMode } from '~/data/pond'

export interface TournamentOperationalCapabilities {
  allowsMarshalWorkflow: boolean
  allowsTeamRegistration: boolean
  allowsTeamRequests: boolean
  description: string
  label: string
  mode: TournamentOperationsMode
}

export const defaultTournamentOperationsMode: TournamentOperationsMode = 'full-dispatch'

export const tournamentOperationsModeOptions: Array<{
  description: string
  label: string
  value: TournamentOperationsMode
}> = [
  {
    description: 'Mapa, sektory a výsledkovka ostanú verejné, ale tímy nepoužívajú interné formuláre.',
    label: 'Len public',
    value: 'public-only',
  },
  {
    description: 'Tímy sa môžu prihlásiť online, ale hlásenia a kontrolóri sa riešia mimo aplikácie.',
    label: 'Prihlášky',
    value: 'registration-only',
  },
  {
    description: 'Zapnuté sú prihlášky tímov, privolanie kontrolóra, váženia, tresty a kontroly.',
    label: 'Plný dispečing',
    value: 'full-dispatch',
  },
]

const tournamentOperationsModeByValue = new Map(
  tournamentOperationsModeOptions.map((option) => [option.value, option]),
)

export function getTournamentOperationsMode(tournament: Pick<Tournament, 'operationsMode'>): TournamentOperationsMode {
  return tournament.operationsMode ?? defaultTournamentOperationsMode
}

export function getTournamentOperationalCapabilities(
  tournament: Pick<Tournament, 'operationsMode'>,
): TournamentOperationalCapabilities {
  const mode = getTournamentOperationsMode(tournament)
  const option = tournamentOperationsModeByValue.get(mode) ?? tournamentOperationsModeByValue.get(defaultTournamentOperationsMode)!

  return {
    allowsMarshalWorkflow: mode === 'full-dispatch',
    allowsTeamRegistration: mode === 'registration-only' || mode === 'full-dispatch',
    allowsTeamRequests: mode === 'full-dispatch',
    description: option.description,
    label: option.label,
    mode,
  }
}
