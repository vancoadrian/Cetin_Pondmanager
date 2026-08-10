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
  getValidationMessages,
  tournamentOperationsModeInputSchema,
  tournamentSectorSettingsInputSchema,
  tournamentTeamRegistrationDecisionInputSchema,
  tournamentTeamRegistrationInputSchema,
} from '~/schemas/pondSchemas'
import { getTournamentOperationalCapabilities } from '~/utils/tournamentOperations'

// This file is the shared foundation for the tournament service modules:
// tournament workflow state shape, cross-cutting helpers (id/timestamp
// generation, state cloning, validation failures) plus the functions that
// stay owned by this module: organizer sector/operations-mode configuration
// and team registration (submission + decision). Sibling modules
// (tournamentRequestService, tournamentCatchVerificationService,
// tournamentDisciplineService) import the shared helpers and types from here.
export interface TournamentWorkflowState {
  tournamentCatches: TournamentCatch[]
  tournamentMarshals: TournamentMarshal[]
  tournamentPenalties: TournamentPenalty[]
  tournamentRequests: TournamentRequest[]
  tournamentRuleChecks: TournamentRuleCheck[]
  tournamentTeamRegistrations: TournamentTeamRegistration[]
  tournaments: Tournament[]
}

export interface TournamentStateResponse extends TournamentWorkflowState {
  ok: true
  updatedAt: string
}

export interface ApiValidationFailure {
  messages: string[]
  ok: false
  statusCode: 400 | 404 | 422
}

export interface TournamentSectorSettingsSuccess extends TournamentWorkflowState {
  message: string
  ok: true
  statusCode: 200
  tournament: Tournament
}

export interface TournamentOperationsModeSuccess extends TournamentWorkflowState {
  message: string
  ok: true
  statusCode: 200
  tournament: Tournament
}

export interface TournamentTeamRegistrationSubmissionSuccess {
  message: string
  ok: true
  registration: TournamentTeamRegistration
  statusCode: 201
}

export interface TournamentTeamRegistrationDecisionSuccess extends TournamentWorkflowState {
  message: string
  ok: true
  registration: TournamentTeamRegistration
  statusCode: 200
}

export type TournamentSectorSettingsResult = ApiValidationFailure | TournamentSectorSettingsSuccess
export type TournamentOperationsModeResult = ApiValidationFailure | TournamentOperationsModeSuccess
export type TournamentTeamRegistrationSubmissionResult = ApiValidationFailure | TournamentTeamRegistrationSubmissionSuccess
export type TournamentTeamRegistrationDecisionResult = ApiValidationFailure | TournamentTeamRegistrationDecisionSuccess

export function unique(values: string[]) {
  return [...new Set(values)]
}

export function failure(messages: string[], statusCode: ApiValidationFailure['statusCode'] = 422): ApiValidationFailure {
  return {
    messages: unique(messages),
    ok: false,
    statusCode,
  }
}

export function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'zaznam'
}

export function uniqueId(baseId: string, existingIds: Set<string>) {
  if (!existingIds.has(baseId)) return baseId

  let index = 2
  while (existingIds.has(`${baseId}-${index}`)) {
    index += 1
  }

  return `${baseId}-${index}`
}

export function compactTimestamp(now: string) {
  const parsed = Date.parse(now)
  const date = Number.isFinite(parsed) ? new Date(parsed) : new Date()

  return date.toISOString().replace(/\D/g, '').slice(0, 12)
}

export function displayTimestamp(now: string) {
  const parsed = Date.parse(now)
  if (!Number.isFinite(parsed)) return now

  return new Date(parsed).toLocaleString('sk-SK', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Bratislava',
  })
}

export function addHoursLabel(now: string, hours: number) {
  const parsed = Date.parse(now)
  if (!Number.isFinite(parsed)) return undefined

  const date = new Date(parsed)
  date.setHours(date.getHours() + hours)

  return displayTimestamp(date.toISOString())
}

export function normalizeClientMutationId(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined
}

export function cloneTournamentState(state: TournamentWorkflowState): TournamentWorkflowState {
  return {
    tournamentCatches: state.tournamentCatches.map((catchItem) => ({ ...catchItem })),
    tournamentMarshals: state.tournamentMarshals.map((marshal) => ({
      ...marshal,
      assignedSectorIds: [...marshal.assignedSectorIds],
    })),
    tournamentPenalties: state.tournamentPenalties.map((penalty) => ({ ...penalty })),
    tournamentRequests: state.tournamentRequests.map((request) => ({ ...request })),
    tournamentRuleChecks: state.tournamentRuleChecks.map((check) => ({ ...check })),
    tournamentTeamRegistrations: state.tournamentTeamRegistrations.map((registration) => ({ ...registration })),
    tournaments: state.tournaments.map((tournament) => ({
      ...tournament,
      operationsMode: tournament.operationsMode ?? 'full-dispatch',
      sectors: tournament.sectors.map((sector) => ({ ...sector })),
    })),
  }
}

export function findTournamentSector(state: TournamentWorkflowState, tournamentId: string, sectorId: string) {
  const tournament = state.tournaments.find((item) => item.id === tournamentId)
  const sector = tournament?.sectors.find((item) => item.id === sectorId)

  return { sector, tournament }
}

export function marshalForSector(state: TournamentWorkflowState, sectorId: string, preferredMarshalId?: string) {
  if (preferredMarshalId) {
    return state.tournamentMarshals.find((marshal) =>
      marshal.id === preferredMarshalId && marshal.assignedSectorIds.includes(sectorId),
    )
  }

  return state.tournamentMarshals.find((marshal) => marshal.assignedSectorIds.includes(sectorId))
}

function duplicatedValues(values: string[]) {
  const seen = new Set<string>()
  const duplicates = new Set<string>()

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value)
    }
    seen.add(value)
  }

  return [...duplicates]
}

function normalizeComparable(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

export function updateTournamentSectors(
  rawInput: unknown,
  state: TournamentWorkflowState,
): TournamentSectorSettingsResult {
  const inputResult = tournamentSectorSettingsInputSchema.safeParse(rawInput)
  if (!inputResult.success) {
    return failure(getValidationMessages(inputResult))
  }

  const input = inputResult.data
  const tournament = state.tournaments.find((item) => item.id === input.tournamentId)
  if (!tournament) {
    return failure(['Súťaž sa nenašla.'], 404)
  }

  const duplicateSectorIds = duplicatedValues(input.sectors.map((sector) => sector.id))
  if (duplicateSectorIds.length > 0) {
    return failure([`Sektorové ID musí byť jedinečné: ${duplicateSectorIds.join(', ')}.`])
  }

  const duplicateSectorLabels = duplicatedValues(input.sectors.map((sector) => sector.label.toLowerCase()))
  if (duplicateSectorLabels.length > 0) {
    return failure(['Označenia sektorov musia byť jedinečné.'])
  }

  const currentSectorIds = tournament.sectors.map((sector) => sector.id)
  const nextSectorIds = input.sectors.map((sector) => sector.id)
  const removedSectorIds = currentSectorIds.filter((sectorId) => !nextSectorIds.includes(sectorId))
  const unknownSectorIds = nextSectorIds.filter((sectorId) => !currentSectorIds.includes(sectorId))

  if (removedSectorIds.length > 0 || unknownSectorIds.length > 0) {
    return failure([
      'V tomto kroku možno upraviť existujúce sektory, nie pridávať alebo mazať sektorové ID počas súťaže.',
    ])
  }

  const nextState = cloneTournamentState(state)
  const nextTournament = nextState.tournaments.find((item) => item.id === input.tournamentId)!
  const sectorDisplayById = new Map(
    input.sectors.map((sector) => [sector.id, sector.team ?? sector.label]),
  )
  const sectorTeamById = new Map(
    input.sectors
      .filter((sector) => sector.team)
      .map((sector) => [sector.id, sector.team!]),
  )

  nextTournament.sectors = input.sectors.map((sector) => ({
    id: sector.id,
    label: sector.label,
    team: sector.team,
    weightKg: sector.weightKg,
    x: sector.x,
    y: sector.y,
  }))

  nextState.tournamentRequests = nextState.tournamentRequests.map((request) =>
    request.tournamentId === input.tournamentId && sectorDisplayById.has(request.sectorId)
      ? { ...request, team: sectorDisplayById.get(request.sectorId)! }
      : request,
  )
  nextState.tournamentCatches = nextState.tournamentCatches.map((catchItem) =>
    catchItem.tournamentId === input.tournamentId && sectorDisplayById.has(catchItem.sectorId)
      ? { ...catchItem, team: sectorDisplayById.get(catchItem.sectorId)! }
      : catchItem,
  )
  nextState.tournamentPenalties = nextState.tournamentPenalties.map((penalty) =>
    penalty.tournamentId === input.tournamentId && sectorDisplayById.has(penalty.sectorId)
      ? { ...penalty, team: sectorDisplayById.get(penalty.sectorId)! }
      : penalty,
  )
  nextState.tournamentTeamRegistrations = nextState.tournamentTeamRegistrations.map((registration) =>
    registration.tournamentId === input.tournamentId
    && registration.status === 'approved'
    && registration.assignedSectorId
    && sectorTeamById.has(registration.assignedSectorId)
      ? { ...registration, teamName: sectorTeamById.get(registration.assignedSectorId)! }
      : registration,
  )

  return {
    ...nextState,
    message: 'Sektory, tímy a priebežná výsledkovka sú uložené.',
    ok: true,
    statusCode: 200,
    tournament: nextTournament,
  }
}

export function updateTournamentOperationsMode(
  rawInput: unknown,
  state: TournamentWorkflowState,
): TournamentOperationsModeResult {
  const inputResult = tournamentOperationsModeInputSchema.safeParse(rawInput)
  if (!inputResult.success) {
    return failure(getValidationMessages(inputResult))
  }

  const input = inputResult.data
  const tournament = state.tournaments.find((item) => item.id === input.tournamentId)
  if (!tournament) {
    return failure(['Súťaž sa nenašla.'], 404)
  }

  const nextState = cloneTournamentState(state)
  const nextTournament = nextState.tournaments.find((item) => item.id === input.tournamentId)!
  nextTournament.operationsMode = input.operationsMode

  return {
    ...nextState,
    message: 'Režim používania súťaže je uložený.',
    ok: true,
    statusCode: 200,
    tournament: nextTournament,
  }
}

export function submitTournamentTeamRegistration(
  rawInput: unknown,
  state: TournamentWorkflowState,
  now = new Date().toISOString(),
): TournamentTeamRegistrationSubmissionResult {
  const inputResult = tournamentTeamRegistrationInputSchema.safeParse(rawInput)
  if (!inputResult.success) {
    return failure(getValidationMessages(inputResult))
  }

  const input = inputResult.data
  const tournament = state.tournaments.find((item) => item.id === input.tournamentId)
  if (!tournament) {
    return failure(['Súťaž sa nenašla.'], 404)
  }

  if (!getTournamentOperationalCapabilities(tournament).allowsTeamRegistration) {
    return failure(['Organizátor tejto súťaže nemá zapnuté online prihlasovanie tímov.'], 400)
  }

  if (input.preferredSectorId && !tournament.sectors.some((sector) => sector.id === input.preferredSectorId)) {
    return failure(['Vybraný preferovaný sektor sa v súťaži nenašiel.'], 404)
  }

  const duplicateRegistration = state.tournamentTeamRegistrations.find((registration) =>
    registration.tournamentId === input.tournamentId
    && registration.status !== 'rejected'
    && normalizeComparable(registration.teamName) === normalizeComparable(input.teamName),
  )
  if (duplicateRegistration) {
    return failure(['Tím s týmto názvom už má v súťaži aktívnu prihlášku.'])
  }

  const registration: TournamentTeamRegistration = {
    city: input.city,
    contactEmail: input.contactEmail,
    contactName: input.contactName,
    contactPhone: input.contactPhone,
    createdAt: displayTimestamp(now),
    id: uniqueId(
      `ttr-${compactTimestamp(now)}-${slugify(input.teamName)}`,
      new Set(state.tournamentTeamRegistrations.map((item) => item.id)),
    ),
    memberCount: input.memberCount,
    note: input.note,
    preferredSectorId: input.preferredSectorId,
    status: 'submitted',
    teamName: input.teamName,
    tournamentId: tournament.id,
  }

  return {
    message: 'Prihláška tímu je uložená a čaká na potvrdenie organizátorom.',
    ok: true,
    registration,
    statusCode: 201,
  }
}

export function submitTournamentTeamRegistrationDecision(
  rawInput: unknown,
  state: TournamentWorkflowState,
  now = new Date().toISOString(),
): TournamentTeamRegistrationDecisionResult {
  const inputResult = tournamentTeamRegistrationDecisionInputSchema.safeParse(rawInput)
  if (!inputResult.success) {
    return failure(getValidationMessages(inputResult))
  }

  const input = inputResult.data
  const registration = state.tournamentTeamRegistrations.find((item) => item.id === input.registrationId)
  if (!registration) {
    return failure(['Prihláška tímu sa nenašla.'], 404)
  }

  const tournament = state.tournaments.find((item) => item.id === registration.tournamentId)
  if (!tournament) {
    return failure(['Súťaž prihlášky sa nenašla.'], 404)
  }

  const assignedSector = input.assignedSectorId
    ? tournament.sectors.find((sector) => sector.id === input.assignedSectorId)
    : undefined

  if (input.action === 'approve' && !assignedSector) {
    return failure(['Vybraný sektor sa v súťaži nenašiel.'], 404)
  }

  if (input.action === 'approve' && assignedSector) {
    const conflictingRegistration = state.tournamentTeamRegistrations.find((item) =>
      item.id !== registration.id
      && item.tournamentId === registration.tournamentId
      && item.status === 'approved'
      && item.assignedSectorId === assignedSector.id,
    )
    if (conflictingRegistration) {
      return failure([`Sektor ${assignedSector.label} už má schválený tím ${conflictingRegistration.teamName}.`])
    }
  }

  const nextState = cloneTournamentState(state)
  const nextRegistration = nextState.tournamentTeamRegistrations.find((item) => item.id === registration.id)!

  nextRegistration.reviewedAt = displayTimestamp(now)
  nextRegistration.reviewNote = input.reviewNote

  if (input.action === 'approve' && assignedSector) {
    nextRegistration.assignedSectorId = assignedSector.id
    nextRegistration.status = 'approved'
    nextState.tournaments = nextState.tournaments.map((item) =>
      item.id === registration.tournamentId
        ? {
            ...item,
            sectors: item.sectors.map((sector) =>
              sector.id === assignedSector.id
                ? { ...sector, team: nextRegistration.teamName }
                : sector,
            ),
          }
        : item,
    )
    nextState.tournamentRequests = nextState.tournamentRequests.map((request) =>
      request.tournamentId === registration.tournamentId && request.sectorId === assignedSector.id
        ? { ...request, team: nextRegistration.teamName }
        : request,
    )
    nextState.tournamentCatches = nextState.tournamentCatches.map((catchItem) =>
      catchItem.tournamentId === registration.tournamentId && catchItem.sectorId === assignedSector.id
        ? { ...catchItem, team: nextRegistration.teamName }
        : catchItem,
    )
    nextState.tournamentPenalties = nextState.tournamentPenalties.map((penalty) =>
      penalty.tournamentId === registration.tournamentId && penalty.sectorId === assignedSector.id
        ? { ...penalty, team: nextRegistration.teamName }
        : penalty,
    )
  }
  else {
    nextRegistration.assignedSectorId = undefined
    nextRegistration.status = input.action === 'waitlist' ? 'waitlisted' : 'rejected'
  }

  const message = input.action === 'approve'
    ? 'Tím je schválený a priradený do sektora.'
    : input.action === 'waitlist'
      ? 'Tím je presunutý do poradovníka.'
      : 'Prihláška tímu je zamietnutá.'

  return {
    ...nextState,
    message,
    ok: true,
    registration: nextRegistration,
    statusCode: 200,
  }
}
