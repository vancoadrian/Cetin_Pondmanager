import type { LakeClosure, Peg } from '~/data/pond'
import {
  getValidationMessages,
  lakeClosureInputSchema,
} from '~/schemas/pondSchemas'

export interface ClosureValidationFailure {
  ok: false
  messages: string[]
  statusCode: 400 | 404 | 422
}

export interface ClosureStateResponse {
  lakeClosures: LakeClosure[]
  ok: true
  updatedAt: string
}

export interface ClosureMutationSuccess {
  closure: LakeClosure
  lakeClosures: LakeClosure[]
  message: string
  ok: true
  statusCode: 200 | 201
}

export interface ClosureWorkflowState {
  lakeClosures: LakeClosure[]
}

export type ClosureMutationResult = ClosureValidationFailure | ClosureMutationSuccess

function unique(values: string[]) {
  return [...new Set(values)]
}

function validationFailure(
  messages: string[],
  statusCode: ClosureValidationFailure['statusCode'] = 422,
): ClosureValidationFailure {
  return {
    ok: false,
    messages: unique(messages),
    statusCode,
  }
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

function buildClosureId(title: string, from: string, existingIds: Set<string>) {
  const baseId = `closure-${from.replaceAll('-', '')}-${slugify(title) || 'blokacia'}`
  if (!existingIds.has(baseId)) return baseId

  let index = 2
  while (existingIds.has(`${baseId}-${index}`)) {
    index += 1
  }

  return `${baseId}-${index}`
}

export function sanitizePublicClosures(closures: LakeClosure[]): LakeClosure[] {
  return closures.map((closure) => {
    if (closure.visibility === 'public') return closure

    return {
      ...closure,
      notes: 'Termín je v internom režime blokovaný správcom revíru.',
      organization: undefined,
      title: 'Interná blokácia termínu',
    }
  })
}

export function saveLakeClosure(
  rawInput: unknown,
  state: ClosureWorkflowState,
  pegs: Peg[],
): ClosureMutationResult {
  const payloadResult = lakeClosureInputSchema.safeParse(rawInput)
  if (!payloadResult.success) {
    return validationFailure(getValidationMessages(payloadResult))
  }

  const payload = payloadResult.data
  const pegMap = new Map(pegs.map((peg) => [peg.id, peg]))
  const missingPegIds = payload.pegIds.filter((pegId) => !pegMap.has(pegId))
  const wrongLakePegIds = payload.lake === 'all'
    ? []
    : payload.pegIds.filter((pegId) => pegMap.get(pegId)?.lake !== payload.lake)

  if (missingPegIds.length > 0 || wrongLakePegIds.length > 0) {
    return validationFailure([
      ...missingPegIds.map((pegId) => `Lovné miesto neexistuje: ${pegId}.`),
      ...wrongLakePegIds.map((pegId) => `Lovné miesto ${pegId} nepatrí k vybranému jazeru.`),
    ])
  }

  const existingIndex = payload.id
    ? state.lakeClosures.findIndex((closure) => closure.id === payload.id)
    : -1
  if (payload.id && existingIndex === -1) {
    return validationFailure(['Uzávierka sa nenašla.'], 404)
  }

  const existingIds = new Set(state.lakeClosures.map((closure) => closure.id))
  const closure: LakeClosure = {
    affectsReservations: payload.affectsReservations,
    from: payload.from,
    id: payload.id || buildClosureId(payload.title, payload.from, existingIds),
    lake: payload.lake,
    notes: payload.notes,
    organization: payload.organization?.trim() || undefined,
    pegIds: payload.pegIds.length > 0 ? payload.pegIds : undefined,
    reason: payload.reason,
    title: payload.title,
    to: payload.to,
    visibility: payload.visibility,
  }
  const lakeClosures = existingIndex >= 0
    ? state.lakeClosures.map((item, index) => index === existingIndex ? closure : item)
    : [closure, ...state.lakeClosures]

  return {
    closure,
    lakeClosures,
    message: existingIndex >= 0
      ? 'Uzávierka bola aktualizovaná.'
      : 'Uzávierka bola uložená a okamžite vstupuje do dostupnosti.',
    ok: true,
    statusCode: existingIndex >= 0 ? 200 : 201,
  }
}
