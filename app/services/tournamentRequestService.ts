import type { TournamentRequest } from '~/data/pond'
import {
  compactTimestamp,
  displayTimestamp,
  failure,
  findTournamentSector,
  marshalForSector,
  normalizeClientMutationId,
  slugify,
  uniqueId,
  type ApiValidationFailure,
  cloneTournamentState,
  type TournamentWorkflowState,
} from '~/services/tournamentApiService'
import { getValidationMessages, tournamentRequestInputSchema } from '~/schemas/pondSchemas'
import { getTournamentOperationalCapabilities } from '~/utils/tournamentOperations'

// Team request creation plus marshal dispatch (assign/resolve) for those
// requests. Shared helpers and the workflow state type live in
// tournamentApiService.ts.
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

export type TournamentRequestSubmissionResult = ApiValidationFailure | TournamentRequestSubmissionSuccess
export type TournamentActionResult = ApiValidationFailure | TournamentActionSuccess

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
    return failure(['Súťaž alebo sektor sa nenašli.'], 404)
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
    message: 'Hlásenie je uložené a čaká v súťažnom dispečingu.',
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
    return failure(['Hlásenie sa nenašlo.'], 404)
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
    message: 'Hlásenie je uzavreté v dispečingu.',
    ok: true,
    request: nextRequest,
    statusCode: 200,
  }
}
