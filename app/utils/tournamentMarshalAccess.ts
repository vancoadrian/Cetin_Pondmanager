import type { Tournament, TournamentMarshal } from '~/data/pond'

export interface TournamentMarshalAccessRow {
  assignedSectorIds: string[]
  marshalId: string
  marshalName: string
  phone: string
  sectorLabels: string[]
  status: TournamentMarshal['status']
  url: string
}

export function createTournamentMarshalAccessUrl(tournamentId: string, marshalId: string) {
  const params = new URLSearchParams({
    kontrolor: marshalId,
    turnaj: tournamentId,
  })

  return `/admin/sutaze/kontrolor?${params.toString()}`
}

export function getTournamentMarshalAccessRows(
  tournament: Pick<Tournament, 'id' | 'sectors'>,
  marshals: TournamentMarshal[],
): TournamentMarshalAccessRow[] {
  return marshals.map((marshal) => {
    const sectorLabels = marshal.assignedSectorIds.map((sectorId) =>
      tournament.sectors.find((sector) => sector.id === sectorId)?.label ?? sectorId,
    )

    return {
      assignedSectorIds: [...marshal.assignedSectorIds],
      marshalId: marshal.id,
      marshalName: marshal.name,
      phone: marshal.phone,
      sectorLabels,
      status: marshal.status,
      url: createTournamentMarshalAccessUrl(tournament.id, marshal.id),
    }
  })
}
