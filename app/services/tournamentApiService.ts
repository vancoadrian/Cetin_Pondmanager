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
  tournamentPenaltyInputSchema,
  tournamentRequestInputSchema,
  tournamentRuleCheckInputSchema,
  tournamentSectorSettingsInputSchema,
  tournamentTeamRegistrationDecisionInputSchema,
  tournamentTeamRegistrationInputSchema,
} from '~/schemas/pondSchemas'
import { getTournamentOperationalCapabilities } from '~/utils/tournamentOperations'

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

export interface TournamentRequestSubmissionSuccess {
  message: string
  ok: true
  request: TournamentRequest
  statusCode: 201
}

export interface TournamentActionSuccess extends TournamentWorkflowState {
  idempotentReplay?: boolean
  message: string
  ok: true
  request?: TournamentRequest
  statusCode: 200
}

export interface TournamentCatchVerificationSuccess extends TournamentWorkflowState {
  catchItem: TournamentCatch
  idempotentReplay?: boolean
  message: string
  ok: true
  statusCode: 200
}

export interface TournamentPenaltySubmissionSuccess extends TournamentWorkflowState {
  idempotentReplay?: boolean
  message: string
  ok: true
  penalty: TournamentPenalty
  statusCode: 200 | 201
}

export interface TournamentRuleCheckSubmissionSuccess extends TournamentWorkflowState {
  check: TournamentRuleCheck
  idempotentReplay?: boolean
  message: string
  ok: true
  statusCode: 200 | 201
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

export type TournamentRequestSubmissionResult = ApiValidationFailure | TournamentRequestSubmissionSuccess
export type TournamentActionResult = ApiValidationFailure | TournamentActionSuccess
export type TournamentCatchVerificationResult = ApiValidationFailure | TournamentCatchVerificationSuccess
export type TournamentPenaltySubmissionResult = ApiValidationFailure | TournamentPenaltySubmissionSuccess
export type TournamentRuleCheckSubmissionResult = ApiValidationFailure | TournamentRuleCheckSubmissionSuccess
export type TournamentSectorSettingsResult = ApiValidationFailure | TournamentSectorSettingsSuccess
export type TournamentOperationsModeResult = ApiValidationFailure | TournamentOperationsModeSuccess
export type TournamentTeamRegistrationSubmissionResult = ApiValidationFailure | TournamentTeamRegistrationSubmissionSuccess
export type TournamentTeamRegistrationDecisionResult = ApiValidationFailure | TournamentTeamRegistrationDecisionSuccess

function unique(values: string[]) {
  return [...new Set(values)]
}

function failure(messages: string[], statusCode: ApiValidationFailure['statusCode'] = 422): ApiValidationFailure {
  return {
    messages: unique(messages),
    ok: false,
    statusCode,
  }
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'zaznam'
}

function uniqueId(baseId: string, existingIds: Set<string>) {
  if (!existingIds.has(baseId)) return baseId

  let index = 2
  while (existingIds.has(`${baseId}-${index}`)) {
    index += 1
  }

  return `${baseId}-${index}`
}

function compactTimestamp(now: string) {
  const parsed = Date.parse(now)
  const date = Number.isFinite(parsed) ? new Date(parsed) : new Date()

  return date.toISOString().replace(/\D/g, '').slice(0, 12)
}

function displayTimestamp(now: string) {
  const parsed = Date.parse(now)
  if (!Number.isFinite(parsed)) return now

  return new Date(parsed).toLocaleString('sk-SK', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Bratislava',
  })
}

function addHoursLabel(now: string, hours: number) {
  const parsed = Date.parse(now)
  if (!Number.isFinite(parsed)) return undefined

  const date = new Date(parsed)
  date.setHours(date.getHours() + hours)

  return displayTimestamp(date.toISOString())
}

function normalizeClientMutationId(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined
}

function cloneTournamentState(state: TournamentWorkflowState): TournamentWorkflowState {
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

function findTournamentSector(state: TournamentWorkflowState, tournamentId: string, sectorId: string) {
  const tournament = state.tournaments.find((item) => item.id === tournamentId)
  const sector = tournament?.sectors.find((item) => item.id === sectorId)

  return { sector, tournament }
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
    return failure(['Súťaž sa v lokálnom stave nenašla.'], 404)
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
    return failure(['Súťaž sa v lokálnom stave nenašla.'], 404)
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
    return failure(['Súťaž sa v lokálnom stave nenašla.'], 404)
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
    return failure(['Prihláška tímu sa v lokálnom stave nenašla.'], 404)
  }

  const tournament = state.tournaments.find((item) => item.id === registration.tournamentId)
  if (!tournament) {
    return failure(['Súťaž prihlášky sa v lokálnom stave nenašla.'], 404)
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

function marshalForSector(state: TournamentWorkflowState, sectorId: string, preferredMarshalId?: string) {
  if (preferredMarshalId) {
    return state.tournamentMarshals.find((marshal) =>
      marshal.id === preferredMarshalId && marshal.assignedSectorIds.includes(sectorId),
    )
  }

  return state.tournamentMarshals.find((marshal) => marshal.assignedSectorIds.includes(sectorId))
}

export function submitTournamentRequest(
  rawInput: unknown,
  state: TournamentWorkflowState,
  now = new Date().toISOString(),
): TournamentRequestSubmissionResult {
  const inputResult = tournamentRequestInputSchema.safeParse(rawInput)
  if (!inputResult.success) {
    return failure(getValidationMessages(inputResult))
  }

  const input = inputResult.data
  const { sector, tournament } = findTournamentSector(state, input.tournamentId, input.sectorId)
  if (!tournament || !sector) {
    return failure(['Súťaž alebo sektor sa v lokálnom stave nenašli.'], 404)
  }

  if (!getTournamentOperationalCapabilities(tournament).allowsTeamRequests) {
    return failure(['Organizátor tejto súťaže nemá zapnuté tímové hlásenia cez aplikáciu.'], 400)
  }

  const requestId = uniqueId(
    `tr-${compactTimestamp(now)}-${input.sectorId}-${slugify(input.type)}`,
    new Set(state.tournamentRequests.map((request) => request.id)),
  )
  const request: TournamentRequest = {
    assignedMarshalId: undefined,
    createdAt: displayTimestamp(now),
    description: input.description.trim() || 'Tím žiada príchod kontrolóra k meraniu úlovku.',
    id: requestId,
    priority: input.type === 'catch-measurement' ? 'high' : 'normal',
    sectorId: input.sectorId,
    status: 'new',
    team: sector.team ?? sector.label,
    tournamentId: tournament.id,
    type: input.type,
  }

  return {
    message: 'Hlásenie je uložené lokálne a čaká v súťažnom dispečingu.',
    ok: true,
    request,
    statusCode: 201,
  }
}

export function submitTournamentRequestAction(
  rawInput: unknown,
  state: TournamentWorkflowState,
): TournamentActionResult {
  const input = rawInput as Partial<{
    action: unknown
    clientMutationId: unknown
    marshalId: unknown
    requestId: unknown
  }>
  const requestId = typeof input.requestId === 'string' ? input.requestId.trim() : ''
  const action = input.action === 'assign' || input.action === 'resolve' ? input.action : undefined
  const clientMutationId = normalizeClientMutationId(input.clientMutationId)
  const preferredMarshalId = typeof input.marshalId === 'string' ? input.marshalId.trim() : undefined

  if (!requestId || !action) {
    return failure(['Chýba ID hlásenia alebo platná admin akcia.'], 400)
  }

  const currentRequest = state.tournamentRequests.find((request) => request.id === requestId)
  if (!currentRequest) {
    return failure(['Hlásenie sa v lokálnom súťažnom stave nenašlo.'], 404)
  }
  const currentTournament = state.tournaments.find((tournament) => tournament.id === currentRequest.tournamentId)
  if (!currentTournament || !getTournamentOperationalCapabilities(currentTournament).allowsMarshalWorkflow) {
    return failure(['Kontrolórsky dispečing nie je pre túto súťaž zapnutý.'], 400)
  }

  if (clientMutationId && currentRequest.actionClientMutationId === clientMutationId) {
    return {
      ...cloneTournamentState(state),
      idempotentReplay: true,
      message: 'Akcia hlásenia už bola spracovaná, nevytváram duplicitný záznam.',
      ok: true,
      request: { ...currentRequest },
      statusCode: 200,
    }
  }

  const nextState = cloneTournamentState(state)
  const nextRequest = nextState.tournamentRequests.find((request) => request.id === requestId)!

  if (action === 'assign') {
    const marshal = marshalForSector(nextState, nextRequest.sectorId, preferredMarshalId)
    if (!marshal) {
      return failure(['Pre tento sektor sa nenašiel priradený kontrolór.'], 404)
    }

    nextRequest.assignedMarshalId = marshal.id
    nextRequest.actionClientMutationId = clientMutationId
    nextRequest.status = 'assigned'
    nextState.tournamentMarshals = nextState.tournamentMarshals.map((item) =>
      item.id === marshal.id
        ? { ...item, status: nextRequest.type === 'catch-measurement' ? 'on-route' : 'available' }
        : item,
    )

    return {
      ...nextState,
      message: `Hlásenie je priradené kontrolórovi ${marshal.name}.`,
      ok: true,
      request: nextRequest,
      statusCode: 200,
    }
  }

  nextRequest.actionClientMutationId = clientMutationId
  nextRequest.status = 'resolved'
  nextState.tournamentMarshals = nextState.tournamentMarshals.map((marshal) =>
    marshal.id === nextRequest.assignedMarshalId && marshal.status === 'on-route'
      ? { ...marshal, status: 'available' }
      : marshal,
  )

  return {
    ...nextState,
    message: 'Hlásenie je uzavreté v lokálnom dispečingu.',
    ok: true,
    request: nextRequest,
    statusCode: 200,
  }
}

export function submitTournamentCatchVerification(
  rawInput: unknown,
  state: TournamentWorkflowState,
  now = new Date().toISOString(),
): TournamentCatchVerificationResult {
  const input = rawInput as Partial<{
    catchId: unknown
    clientMutationId: unknown
    marshalId: unknown
    status: unknown
  }>
  const catchId = typeof input.catchId === 'string' ? input.catchId.trim() : ''
  const clientMutationId = normalizeClientMutationId(input.clientMutationId)
  const status = input.status === 'verified' || input.status === 'disputed' ? input.status : undefined
  const marshalId = typeof input.marshalId === 'string' && input.marshalId.trim()
    ? input.marshalId.trim()
    : undefined

  if (!catchId || !status) {
    return failure(['Chýba ID úlovku alebo platný výsledok váženia.'], 400)
  }

  const currentCatch = state.tournamentCatches.find((catchItem) => catchItem.id === catchId)
  if (!currentCatch) {
    return failure(['Súťažný úlovok sa v lokálnom stave nenašiel.'], 404)
  }
  const tournament = state.tournaments.find((item) => item.id === currentCatch.tournamentId)
  if (!tournament || !getTournamentOperationalCapabilities(tournament).allowsMarshalWorkflow) {
    return failure(['Kontrolórsky dispečing nie je pre túto súťaž zapnutý.'], 400)
  }

  if (clientMutationId && currentCatch.verificationClientMutationId === clientMutationId) {
    return {
      ...cloneTournamentState(state),
      catchItem: { ...currentCatch },
      idempotentReplay: true,
      message: 'Overenie váženia už bolo spracované, nevytváram duplicitný záznam.',
      ok: true,
      statusCode: 200,
    }
  }

  const nextState = cloneTournamentState(state)
  const nextCatch = nextState.tournamentCatches.find((catchItem) => catchItem.id === catchId)!
  const resolvedMarshalId = marshalId ?? nextCatch.verifiedByMarshalId

  nextCatch.measuredAt = displayTimestamp(now)
  nextCatch.status = status
  nextCatch.verifiedByMarshalId = resolvedMarshalId
  nextCatch.verificationClientMutationId = clientMutationId
  nextCatch.notes = status === 'verified'
    ? 'Váženie overené kontrolórom v lokálnom dispečingu.'
    : 'Váženie označené ako sporné, čaká na posúdenie organizátorom.'

  nextState.tournamentMarshals = nextState.tournamentMarshals.map((marshal) =>
    marshal.id === resolvedMarshalId
      ? { ...marshal, status: 'available' }
      : marshal,
  )

  return {
    ...nextState,
    catchItem: nextCatch,
    message: status === 'verified'
      ? 'Úlovok je overený a uložený v súťažnom stave.'
      : 'Úlovok je označený ako sporný.',
    ok: true,
    statusCode: 200,
  }
}

export function submitTournamentPenalty(
  rawInput: unknown,
  state: TournamentWorkflowState,
  now = new Date().toISOString(),
): TournamentPenaltySubmissionResult {
  const inputResult = tournamentPenaltyInputSchema.safeParse(rawInput)
  if (!inputResult.success) {
    return failure(getValidationMessages(inputResult))
  }

  const input = inputResult.data
  const existingPenalty = input.clientMutationId
    ? state.tournamentPenalties.find((penalty) => penalty.clientMutationId === input.clientMutationId)
    : undefined
  if (existingPenalty) {
    return {
      ...cloneTournamentState(state),
      idempotentReplay: true,
      message: 'Trest už bol spracovaný, nevytváram duplicitný záznam.',
      ok: true,
      penalty: { ...existingPenalty },
      statusCode: 200,
    }
  }

  const { sector, tournament } = findTournamentSector(state, input.tournamentId, input.sectorId)
  if (!tournament || !sector) {
    return failure(['Súťaž alebo sektor sa v lokálnom stave nenašli.'], 404)
  }

  if (!getTournamentOperationalCapabilities(tournament).allowsMarshalWorkflow) {
    return failure(['Kontrolórsky dispečing nie je pre túto súťaž zapnutý.'], 400)
  }

  const marshal = marshalForSector(state, input.sectorId, input.marshalId)
  if (!marshal) {
    return failure(['Vybraný kontrolór nemá priradený tento sektor.'], 422)
  }

  const penalty: TournamentPenalty = {
    clientMutationId: input.clientMutationId,
    durationHours: input.durationHours,
    endsAt: input.durationHours ? addHoursLabel(now, input.durationHours) : undefined,
    id: uniqueId(
      `tp-${compactTimestamp(now)}-${input.sectorId}-${slugify(input.type)}`,
      new Set(state.tournamentPenalties.map((item) => item.id)),
    ),
    issuedAt: displayTimestamp(now),
    issuedByMarshalId: marshal.id,
    reason: input.reason,
    rodsLess: input.type === 'rod-reduction' ? input.rodsLess : undefined,
    sectorId: input.sectorId,
    startsAt: input.durationHours ? displayTimestamp(now) : undefined,
    status: 'active',
    team: sector.team ?? sector.label,
    tournamentId: tournament.id,
    type: input.type,
  }
  const nextState = cloneTournamentState(state)

  nextState.tournamentPenalties = [penalty, ...nextState.tournamentPenalties]
  nextState.tournamentRuleChecks = [
    {
      checkedAt: penalty.issuedAt,
      clientMutationId: input.clientMutationId ? `${input.clientMutationId}:penalty-check` : undefined,
      id: uniqueId(
        `check-${compactTimestamp(now)}-${input.sectorId}-penalty`,
        new Set(nextState.tournamentRuleChecks.map((check) => check.id)),
      ),
      marshalId: marshal.id,
      note: `Trest: ${input.reason}`,
      result: 'penalty',
      sectorId: input.sectorId,
      tournamentId: tournament.id,
    },
    ...nextState.tournamentRuleChecks,
  ]
  nextState.tournamentMarshals = nextState.tournamentMarshals.map((item) =>
    item.id === marshal.id
      ? { ...item, status: 'available' }
      : item,
  )

  return {
    ...nextState,
    message: 'Trest je uložený lokálne a automaticky zapísaný aj ako kontrola pravidiel.',
    ok: true,
    penalty,
    statusCode: 201,
  }
}

export function submitTournamentRuleCheck(
  rawInput: unknown,
  state: TournamentWorkflowState,
  now = new Date().toISOString(),
): TournamentRuleCheckSubmissionResult {
  const inputResult = tournamentRuleCheckInputSchema.safeParse(rawInput)
  if (!inputResult.success) {
    return failure(getValidationMessages(inputResult))
  }

  const input = inputResult.data
  const existingCheck = input.clientMutationId
    ? state.tournamentRuleChecks.find((check) => check.clientMutationId === input.clientMutationId)
    : undefined
  if (existingCheck) {
    return {
      ...cloneTournamentState(state),
      check: { ...existingCheck },
      idempotentReplay: true,
      message: 'Kontrola pravidiel už bola spracovaná, nevytváram duplicitný záznam.',
      ok: true,
      statusCode: 200,
    }
  }

  const { sector, tournament } = findTournamentSector(state, input.tournamentId, input.sectorId)
  if (!tournament || !sector) {
    return failure(['Súťaž alebo sektor sa v lokálnom stave nenašli.'], 404)
  }

  if (!getTournamentOperationalCapabilities(tournament).allowsMarshalWorkflow) {
    return failure(['Kontrolórsky dispečing nie je pre túto súťaž zapnutý.'], 400)
  }

  const marshal = marshalForSector(state, input.sectorId, input.marshalId)
  if (!marshal) {
    return failure(['Vybraný kontrolór nemá priradený tento sektor.'], 422)
  }

  const check: TournamentRuleCheck = {
    checkedAt: displayTimestamp(now),
    clientMutationId: input.clientMutationId,
    id: uniqueId(
      `check-${compactTimestamp(now)}-${input.sectorId}-${input.result}`,
      new Set(state.tournamentRuleChecks.map((item) => item.id)),
    ),
    marshalId: marshal.id,
    note: input.note,
    result: input.result,
    sectorId: input.sectorId,
    tournamentId: tournament.id,
  }
  const nextState = cloneTournamentState(state)

  nextState.tournamentRuleChecks = [check, ...nextState.tournamentRuleChecks]
  nextState.tournamentMarshals = nextState.tournamentMarshals.map((item) =>
    item.id === marshal.id
      ? { ...item, status: 'available' }
      : item,
  )

  return {
    ...nextState,
    check,
    message: 'Kontrola pravidiel je uložená lokálne.',
    ok: true,
    statusCode: 201,
  }
}
