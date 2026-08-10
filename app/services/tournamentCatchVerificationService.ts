import {
  cloneTournamentState,
  displayTimestamp,
  failure,
  normalizeClientMutationId,
  type ApiValidationFailure,
  type TournamentWorkflowState,
} from '~/services/tournamentApiService'
import type { TournamentCatch } from '~/data/pond'
import { getTournamentOperationalCapabilities } from '~/utils/tournamentOperations'

// Catch-weighing verification/dispute logic. Shared helpers and the
// workflow state type live in tournamentApiService.ts.
export interface TournamentCatchVerificationSuccess extends TournamentWorkflowState {
  catchItem: TournamentCatch
  idempotentReplay?: boolean
  message: string
  ok: true
  statusCode: 200
}

export type TournamentCatchVerificationResult = ApiValidationFailure | TournamentCatchVerificationSuccess

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
    return failure(['Súťažný úlovok sa nenašiel.'], 404)
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
    ? 'Váženie overené kontrolórom v dispečingu.'
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
