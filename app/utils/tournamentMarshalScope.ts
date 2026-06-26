import type { MockUser } from '~/composables/useMockAuth'
import type { TournamentMarshal } from '~/data/pond'

export interface TournamentMarshalScopeInput {
  assignedMarshalId?: unknown
  requestedMarshalId?: unknown
  sectorId: unknown
  tournamentId: unknown
}

export interface TournamentMarshalScopeDecision {
  allowed: boolean
  marshalId?: string
  reason?: string
  scoped: boolean
}

function normalizedString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function getTournamentMarshalScopeDecision(
  user: MockUser | null | undefined,
  marshals: TournamentMarshal[],
  input: TournamentMarshalScopeInput,
): TournamentMarshalScopeDecision {
  const requestedMarshalId = normalizedString(input.requestedMarshalId)
  if (user?.role !== 'marshal') {
    return {
      allowed: true,
      marshalId: requestedMarshalId,
      scoped: false,
    }
  }

  if (!user.marshalId || !user.tournamentId) {
    return {
      allowed: false,
      reason: 'Kontrolórsky účet nemá nakonfigurovanú súťaž alebo identitu kontrolóra.',
      scoped: true,
    }
  }

  if (normalizedString(input.tournamentId) !== user.tournamentId) {
    return {
      allowed: false,
      reason: 'Kontrolór môže pracovať iba v pridelenej súťaži.',
      scoped: true,
    }
  }

  if (requestedMarshalId && requestedMarshalId !== user.marshalId) {
    return {
      allowed: false,
      reason: 'Kontrolór nemôže zapisovať úkony pod identitou iného kontrolóra.',
      scoped: true,
    }
  }

  const assignedMarshalId = normalizedString(input.assignedMarshalId)
  if (assignedMarshalId && assignedMarshalId !== user.marshalId) {
    return {
      allowed: false,
      reason: 'Udalosť je už pridelená inému kontrolórovi.',
      scoped: true,
    }
  }

  const marshal = marshals.find((item) => item.id === user.marshalId)
  const sectorId = normalizedString(input.sectorId)
  if (!marshal || !sectorId || !marshal.assignedSectorIds.includes(sectorId)) {
    return {
      allowed: false,
      reason: 'Kontrolór môže pracovať iba vo svojich pridelených sektoroch.',
      scoped: true,
    }
  }

  return {
    allowed: true,
    marshalId: user.marshalId,
    scoped: true,
  }
}
