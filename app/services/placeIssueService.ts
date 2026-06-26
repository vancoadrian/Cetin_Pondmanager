import type { PlaceIssue } from '~/data/pond'
import {
  getValidationMessages,
  placeIssueActionInputSchema,
  placeIssueInputSchema,
} from '~/schemas/pondSchemas'
import { pondService, type PondService } from '~/services/pondService'

export interface PlaceIssueWorkflowState {
  placeIssues: PlaceIssue[]
}

export interface PlaceIssueStateResponse extends PlaceIssueWorkflowState {
  ok: true
  updatedAt: string
}

export interface PlaceIssueValidationFailure {
  ok: false
  messages: string[]
  statusCode: 400 | 404 | 422
}

export interface PlaceIssueSubmissionSuccess extends PlaceIssueWorkflowState {
  issue: PlaceIssue
  message: string
  ok: true
  statusCode: 201
}

export interface PlaceIssueActionSuccess extends PlaceIssueWorkflowState {
  issue: PlaceIssue
  message: string
  ok: true
  statusCode: 200
}

export type PlaceIssueSubmissionResult = PlaceIssueSubmissionSuccess | PlaceIssueValidationFailure
export type PlaceIssueActionResult = PlaceIssueActionSuccess | PlaceIssueValidationFailure

function unique(values: string[]) {
  return [...new Set(values)]
}

function failure(
  messages: string[],
  statusCode: PlaceIssueValidationFailure['statusCode'] = 422,
): PlaceIssueValidationFailure {
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
    || 'hlasenie'
}

function compactDate(value: string) {
  const parsed = Date.parse(value)
  const date = Number.isFinite(parsed) ? new Date(parsed) : new Date()

  return date.toISOString().slice(0, 10).replaceAll('-', '')
}

function uniqueId(baseId: string, existingIds: Set<string>) {
  if (!existingIds.has(baseId)) return baseId

  let index = 2
  while (existingIds.has(`${baseId}-${index}`)) {
    index += 1
  }

  return `${baseId}-${index}`
}

function clonePlaceIssue(issue: PlaceIssue): PlaceIssue {
  return { ...issue }
}

export function clonePlaceIssueWorkflowState(placeIssues: PlaceIssue[]): PlaceIssueWorkflowState {
  return {
    placeIssues: placeIssues.map(clonePlaceIssue),
  }
}

function defaultPriorityForCategory(category: PlaceIssue['category']): PlaceIssue['priority'] {
  if (category === 'safety') return 'urgent'
  if (category === 'missing-equipment' || category === 'lighting' || category === 'broken') return 'normal'

  return 'low'
}

function resolveIssueTargetLabel(
  input: Pick<PlaceIssue, 'lake' | 'targetId' | 'targetType'>,
  service: PondService,
): { ok: true, label: string } | PlaceIssueValidationFailure {
  if (!service.getLakeBySlug(input.lake)) {
    return failure(['Vybrané jazero neexistuje.'], 404)
  }

  if (input.targetType === 'lake') {
    return {
      label: service.getLakeName(input.lake),
      ok: true,
    }
  }

  if (input.targetType === 'peg') {
    const peg = service.pegs.find((item) => item.id === input.targetId && item.lake === input.lake)
    if (!peg) return failure(['Vybrané lovné miesto neexistuje pre zvolené jazero.'], 404)

    return {
      label: peg.label,
      ok: true,
    }
  }

  const facility = service.mapFacilities.find((item) => item.id === input.targetId && item.lake === input.lake)
  if (!facility) return failure(['Vybraný servisný bod neexistuje pre zvolené jazero.'], 404)

  return {
    label: facility.label,
    ok: true,
  }
}

function createIssueId(
  input: Pick<PlaceIssue, 'createdAt' | 'targetLabel' | 'title'>,
  state: PlaceIssueWorkflowState,
) {
  const baseId = `issue-${compactDate(input.createdAt)}-${slugify(input.targetLabel).slice(0, 24)}-${slugify(input.title).slice(0, 28)}`

  return uniqueId(baseId, new Set(state.placeIssues.map((issue) => issue.id)))
}

export function submitPlaceIssue(
  rawInput: unknown,
  state: PlaceIssueWorkflowState,
  service: PondService = pondService,
  now = new Date().toISOString(),
): PlaceIssueSubmissionResult {
  const inputResult = placeIssueInputSchema.safeParse(rawInput)
  if (!inputResult.success) {
    return failure(getValidationMessages(inputResult))
  }

  const input = inputResult.data
  const target = resolveIssueTargetLabel(input, service)
  if (!target.ok) return target

  const issue: PlaceIssue = {
    category: input.category,
    createdAt: now,
    description: input.description,
    id: createIssueId({
      createdAt: now,
      targetLabel: target.label,
      title: input.title,
    }, state),
    internalNote: '',
    lake: input.lake,
    photoLabel: input.photoLabel,
    priority: defaultPriorityForCategory(input.category),
    reporterName: input.reporterName,
    reporterPhone: input.reporterPhone,
    status: 'new',
    targetId: input.targetType === 'lake' ? undefined : input.targetId,
    targetLabel: target.label,
    targetType: input.targetType,
    title: input.title,
    updatedAt: now,
  }

  return {
    issue,
    message: 'Hlásenie je uložené pre správcu revíru.',
    ok: true,
    placeIssues: [issue, ...state.placeIssues],
    statusCode: 201,
  }
}

export function submitPlaceIssueAction(
  rawInput: unknown,
  state: PlaceIssueWorkflowState,
  now = new Date().toISOString(),
): PlaceIssueActionResult {
  const inputResult = placeIssueActionInputSchema.safeParse(rawInput)
  if (!inputResult.success) {
    return failure(getValidationMessages(inputResult))
  }

  const input = inputResult.data
  const existingIssue = state.placeIssues.find((issue) => issue.id === input.issueId)
  if (!existingIssue) {
    return failure(['Hlásenie sa v lokálnom store nenašlo.'], 404)
  }

  const issue: PlaceIssue = {
    ...existingIssue,
    assignedTo: input.assignedTo,
    internalNote: input.internalNote,
    priority: input.priority,
    resolutionNote: input.resolutionNote,
    status: input.status,
    updatedAt: now,
  }

  return {
    issue,
    message: issue.status === 'resolved'
      ? 'Hlásenie je označené ako vyriešené.'
      : 'Hlásenie je aktualizované.',
    ok: true,
    placeIssues: state.placeIssues.map((item) => item.id === issue.id ? issue : item),
    statusCode: 200,
  }
}
