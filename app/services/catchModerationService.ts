import type { CatchPhoto, CatchRecord, CatchRecordStatus, TripLogbook, TripLogbookEntry } from '~/data/pond'
import { catchModerationInputSchema, getValidationMessages } from '~/schemas/pondSchemas'
import type { ApiValidationFailure, CatchWorkflowState } from '~/services/catchApiService'

export type CatchModerationDecisionMode = 'approve' | 'pending' | 'reject'

export interface CatchModerationSuccess extends CatchWorkflowState {
  catch: CatchRecord
  message: string
  ok: true
  statusCode: 200
}

export type CatchModerationResult = ApiValidationFailure | CatchModerationSuccess

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

function cloneTripLogbooks(items: TripLogbook[]) {
  return items.map((item) => ({
    ...item,
    members: item.members.map((member) => ({ ...member })),
    pegIds: [...item.pegIds],
  }))
}

function cloneCatchPhotos(items: CatchPhoto[]) {
  return items.map((item) => ({ ...item }))
}

function cloneTripLogbookEntries(items: TripLogbookEntry[]) {
  return items.map((item) => ({ ...item }))
}

function statusForDecision(decisionMode: CatchModerationDecisionMode): CatchRecordStatus {
  if (decisionMode === 'approve') return 'approved'
  if (decisionMode === 'reject') return 'rejected'

  return 'pending'
}

function messageForStatus(status: CatchRecordStatus) {
  if (status === 'approved') return 'Úlovok je schválený a môže sa zobraziť vo verejnom denníku.'
  if (status === 'rejected') return 'Úlovok je zamietnutý a zostáva mimo verejného denníka.'

  return 'Úlovok zostáva v stave na kontrolu.'
}

export function submitCatchModerationDecision(
  rawInput: unknown,
  state: CatchWorkflowState,
  reviewer = 'Správca',
  now = new Date().toISOString(),
): CatchModerationResult {
  const inputResult = catchModerationInputSchema.safeParse(rawInput)
  if (!inputResult.success) {
    return failure(getValidationMessages(inputResult))
  }

  const input = inputResult.data
  const currentCatch = state.catches.find((catchItem) => catchItem.id === input.catchId)
  if (!currentCatch) {
    return failure(['Úlovok sa nenašiel v lokálnom mock stave.'], 404)
  }

  const status = statusForDecision(input.decisionMode)
  const nextCatch: CatchRecord = {
    ...currentCatch,
    reviewNote: input.note,
    reviewedAt: now,
    reviewedBy: reviewer,
    status,
  }
  const nextCatches = state.catches.map((catchItem) =>
    catchItem.id === input.catchId ? nextCatch : { ...catchItem },
  )

  return {
    catch: nextCatch,
    catchPhotos: cloneCatchPhotos(state.catchPhotos),
    catches: nextCatches,
    message: messageForStatus(status),
    ok: true,
    statusCode: 200,
    tripLogbookEntries: cloneTripLogbookEntries(state.tripLogbookEntries),
    tripLogbooks: cloneTripLogbooks(state.tripLogbooks),
  }
}
