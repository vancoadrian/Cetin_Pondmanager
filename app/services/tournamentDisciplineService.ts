import type { TournamentPenalty, TournamentRuleCheck } from '~/data/pond'
import {
  addHoursLabel,
  cloneTournamentState,
  compactTimestamp,
  displayTimestamp,
  failure,
  findTournamentSector,
  marshalForSector,
  slugify,
  uniqueId,
  type ApiValidationFailure,
  type TournamentWorkflowState,
} from '~/services/tournamentApiService'
import {
  getValidationMessages,
  tournamentPenaltyInputSchema,
  tournamentRuleCheckInputSchema,
} from '~/schemas/pondSchemas'
import { getTournamentOperationalCapabilities } from '~/utils/tournamentOperations'

// Penalties and standalone rule checks issued by marshals. Shared helpers
// and the workflow state type live in tournamentApiService.ts.
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

export type TournamentPenaltySubmissionResult = ApiValidationFailure | TournamentPenaltySubmissionSuccess
export type TournamentRuleCheckSubmissionResult = ApiValidationFailure | TournamentRuleCheckSubmissionSuccess

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
    return failure(['Súťaž alebo sektor sa nenašli.'], 404)
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
    message: 'Trest je uložený a automaticky zapísaný aj ako kontrola pravidiel.',
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
    return failure(['Súťaž alebo sektor sa nenašli.'], 404)
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
    message: 'Kontrola pravidiel je uložená.',
    ok: true,
    statusCode: 201,
  }
}
