import type {
  Tournament,
  TournamentCatch,
  TournamentMarshal,
  TournamentPenalty,
  TournamentRequest,
  TournamentRuleCheck,
} from '~/data/pond'
import {
  getValidationMessages,
  tournamentPenaltyInputSchema,
  tournamentRequestInputSchema,
  tournamentRuleCheckInputSchema,
} from '~/schemas/pondSchemas'

export interface TournamentWorkflowState {
  tournamentCatches: TournamentCatch[]
  tournamentMarshals: TournamentMarshal[]
  tournamentPenalties: TournamentPenalty[]
  tournamentRequests: TournamentRequest[]
  tournamentRuleChecks: TournamentRuleCheck[]
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
  message: string
  ok: true
  request?: TournamentRequest
  statusCode: 200
}

export interface TournamentCatchVerificationSuccess extends TournamentWorkflowState {
  catchItem: TournamentCatch
  message: string
  ok: true
  statusCode: 200
}

export interface TournamentPenaltySubmissionSuccess extends TournamentWorkflowState {
  message: string
  ok: true
  penalty: TournamentPenalty
  statusCode: 201
}

export interface TournamentRuleCheckSubmissionSuccess extends TournamentWorkflowState {
  check: TournamentRuleCheck
  message: string
  ok: true
  statusCode: 201
}

export type TournamentRequestSubmissionResult = ApiValidationFailure | TournamentRequestSubmissionSuccess
export type TournamentActionResult = ApiValidationFailure | TournamentActionSuccess
export type TournamentCatchVerificationResult = ApiValidationFailure | TournamentCatchVerificationSuccess
export type TournamentPenaltySubmissionResult = ApiValidationFailure | TournamentPenaltySubmissionSuccess
export type TournamentRuleCheckSubmissionResult = ApiValidationFailure | TournamentRuleCheckSubmissionSuccess

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
    tournaments: state.tournaments.map((tournament) => ({
      ...tournament,
      sectors: tournament.sectors.map((sector) => ({ ...sector })),
    })),
  }
}

function findTournamentSector(state: TournamentWorkflowState, tournamentId: string, sectorId: string) {
  const tournament = state.tournaments.find((item) => item.id === tournamentId)
  const sector = tournament?.sectors.find((item) => item.id === sectorId)

  return { sector, tournament }
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
    marshalId: unknown
    requestId: unknown
  }>
  const requestId = typeof input.requestId === 'string' ? input.requestId.trim() : ''
  const action = input.action === 'assign' || input.action === 'resolve' ? input.action : undefined
  const preferredMarshalId = typeof input.marshalId === 'string' ? input.marshalId.trim() : undefined

  if (!requestId || !action) {
    return failure(['Chýba ID hlásenia alebo platná admin akcia.'], 400)
  }

  const currentRequest = state.tournamentRequests.find((request) => request.id === requestId)
  if (!currentRequest) {
    return failure(['Hlásenie sa v lokálnom súťažnom stave nenašlo.'], 404)
  }

  const nextState = cloneTournamentState(state)
  const nextRequest = nextState.tournamentRequests.find((request) => request.id === requestId)!

  if (action === 'assign') {
    const marshal = marshalForSector(nextState, nextRequest.sectorId, preferredMarshalId)
    if (!marshal) {
      return failure(['Pre tento sektor sa nenašiel priradený kontrolór.'], 404)
    }

    nextRequest.assignedMarshalId = marshal.id
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
    marshalId: unknown
    status: unknown
  }>
  const catchId = typeof input.catchId === 'string' ? input.catchId.trim() : ''
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

  const nextState = cloneTournamentState(state)
  const nextCatch = nextState.tournamentCatches.find((catchItem) => catchItem.id === catchId)!
  const resolvedMarshalId = marshalId ?? nextCatch.verifiedByMarshalId

  nextCatch.measuredAt = displayTimestamp(now)
  nextCatch.status = status
  nextCatch.verifiedByMarshalId = resolvedMarshalId
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
  const { sector, tournament } = findTournamentSector(state, input.tournamentId, input.sectorId)
  if (!tournament || !sector) {
    return failure(['Súťaž alebo sektor sa v lokálnom stave nenašli.'], 404)
  }

  const marshal = marshalForSector(state, input.sectorId, input.marshalId)
  if (!marshal) {
    return failure(['Vybraný kontrolór nemá priradený tento sektor.'], 422)
  }

  const penalty: TournamentPenalty = {
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
  const { sector, tournament } = findTournamentSector(state, input.tournamentId, input.sectorId)
  if (!tournament || !sector) {
    return failure(['Súťaž alebo sektor sa v lokálnom stave nenašli.'], 404)
  }

  const marshal = marshalForSector(state, input.sectorId, input.marshalId)
  if (!marshal) {
    return failure(['Vybraný kontrolór nemá priradený tento sektor.'], 422)
  }

  const check: TournamentRuleCheck = {
    checkedAt: displayTimestamp(now),
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
